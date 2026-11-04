import { ROBOTS_TOKEN, readUrl } from './webReader.js';

// robots.txt: what a site asks automatic readers to leave alone. The finder obeys it. Pure parsing here (tested on its own) and one
// function that fetches and applies it.

export const ROBOTS_LIMITS = { bytes: 500_000, lines: 5000 };

/**
 * Parses robots.txt into groups. Returns { groups: [{ agents: string[], rules: [{ allow, pattern }] }], sitemaps: string[] }.
 * Lines are "Field: value"; comments (#) and unknown fields are ignored; groups start at "User-agent" lines.
 */
export const parseRobots = (text) => {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).slice(0, ROBOTS_LIMITS.lines);
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const at = line.indexOf(':');
    if (at < 1) continue;
    const field = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === 'sitemap') {
      if (/^https?:\/\//i.test(value)) sitemaps.push(value);
    } else if ((field === 'allow' || field === 'disallow') && current) {
      current.rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  return { groups, sitemaps };
};

/** The rules that apply to us: the group naming our token (longest match wins), else the "*" group, else none. */
const rulesFor = (robots, token = ROBOTS_TOKEN) => {
  const mine = token.toLowerCase();
  let best = null;
  for (const group of robots.groups) {
    for (const agent of group.agents) {
      if (agent === '*') continue;
      if (mine.includes(agent) && (!best || agent.length > best.length)) best = { length: agent.length, group };
    }
  }
  if (best) return best.group.rules;
  const star = robots.groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  return star;
};

const patternToRegExp = (pattern) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped.endsWith('\\$') ? `${escaped.slice(0, -2)}$` : escaped}`);
};

/**
 * May this path (with its query) be read? The longest matching rule wins; on a tie "Allow" wins; no matching rule means yes.
 * An empty "Disallow:" allows everything.
 */
export const isPathAllowed = (robots, pathWithQuery, token = ROBOTS_TOKEN) => {
  const rules = rulesFor(robots, token).filter((r) => r.pattern !== '');
  let verdict = { allow: true, length: -1 };
  for (const rule of rules) {
    let matches = false;
    try {
      matches = patternToRegExp(rule.pattern).test(pathWithQuery);
    } catch {
      matches = false;
    }
    if (!matches) continue;
    if (rule.pattern.length > verdict.length || (rule.pattern.length === verdict.length && rule.allow)) verdict = { allow: rule.allow, length: rule.pattern.length };
  }
  return verdict.allow;
};

const EVERYTHING = { groups: [], sitemaps: [] };

/**
 * Reads a site's robots.txt once. The answer follows the usual convention: a missing file (404 and other 4xx) means "everything may be
 * read"; a file that cannot be fetched at all (the server is down, a 5xx) is treated as "everything may be read" too but is reported in
 * `note`, because the page itself is about to be asked for anyway and will fail the same way if the site is really down.
 *
 * @returns {Promise<{ robots: object, found: boolean, note: string }>}
 */
export const loadRobots = async (origin, options = {}) => {
  const result = await readUrl(`${origin}/robots.txt`, { ...options, accept: ['text', 'html', 'other', 'xml'], maxBytes: ROBOTS_LIMITS.bytes, timeoutMs: Math.min(options.timeoutMs ?? 4000, 4000), maxRedirects: 3 });
  if (result.ok) {
    // A "robots.txt" that is really the site's home page (single-page sites answer every address with it) says nothing.
    if (result.kind === 'html' && /<html|<!doctype/i.test(result.text.slice(0, 500))) return { robots: EVERYTHING, found: false, note: '' };
    return { robots: parseRobots(result.text), found: true, note: '' };
  }
  if (result.code === 'NOT_FOUND' || (result.status && result.status < 500 && result.status !== 429)) return { robots: EVERYTHING, found: false, note: '' };
  if (result.code === 'BLOCKED_BY_SITE') return { robots: EVERYTHING, found: false, note: '' };
  return { robots: EVERYTHING, found: false, note: "The site's robots.txt could not be read, so its reading rules were not checked." };
};
