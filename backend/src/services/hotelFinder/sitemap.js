import zlib from 'node:zlib';
import { Parser } from 'htmlparser2';
import { siteOf } from './addressGuard.js';
import { readUrl } from './webReader.js';

// A site's sitemap lists its pages, which is the quickest honest way to find the "contact", "rooms" and "location" pages without
// crawling. Parsing is separate (pure, tested) from the reading.

export const SITEMAP_LIMITS = { urls: 5000, files: 3, bytes: 2_000_000 };

/**
 * Reads sitemap text: the XML form (<urlset> of <url>, or a <sitemapindex> of <sitemap>) or a plain list of addresses.
 * @returns {{ urls: { loc: string, lastmod: string, priority: number }[], sitemaps: string[] }}
 */
export const parseSitemap = (text, { maxUrls = SITEMAP_LIMITS.urls } = {}) => {
  const body = String(text || '').replace(/^﻿/, '');
  const urls = [];
  const sitemaps = [];
  if (!/^\s*<(?:\?xml|urlset|sitemapindex)/i.test(body)) {
    // A plain text sitemap: one address per line.
    for (const line of body.split(/\r?\n/)) {
      const loc = line.trim();
      if (/^https?:\/\/\S+$/i.test(loc) && urls.length < maxUrls) urls.push({ loc, lastmod: '', priority: 0.5 });
    }
    return { urls, sitemaps };
  }
  let context = null;
  let buffer = '';
  const parser = new Parser(
    {
      onopentag(name) {
        const tag = name.toLowerCase();
        if (tag === 'url' || tag === 'sitemap') context = { kind: tag, loc: '', lastmod: '', priority: 0.5 };
        buffer = '';
      },
      ontext(chunk) {
        if (buffer.length < 4096) buffer += chunk;
      },
      onclosetag(name, isImplied) {
        const tag = name.toLowerCase();
        if (!context) return;
        if (isImplied) {
          // The file was cut off in the middle of this entry: its address may be cut too, so it is not used.
          context = null;
          return;
        }
        if (tag === 'loc') context.loc = buffer.trim();
        else if (tag === 'lastmod') context.lastmod = buffer.trim();
        else if (tag === 'priority') {
          const p = Number(buffer.trim());
          if (Number.isFinite(p) && p >= 0 && p <= 1) context.priority = p;
        } else if (tag === 'url' || tag === 'sitemap') {
          if (/^https?:\/\/\S+$/i.test(context.loc)) {
            if (context.kind === 'sitemap') sitemaps.push(context.loc);
            else if (urls.length < maxUrls) urls.push({ loc: context.loc, lastmod: context.lastmod, priority: context.priority });
          }
          context = null;
        }
        buffer = '';
      }
    },
    { xmlMode: true, decodeEntities: true }
  );
  try {
    parser.write(body);
    parser.end();
  } catch {
    // a broken file still gives what was read before the break
  }
  return { urls, sitemaps };
};

const readSitemapFile = async (url, options) => {
  const wantsGz = /\.gz(?:$|\?)/i.test(url);
  const result = await readUrl(url, { ...options, accept: ['xml', 'text', 'html', 'other'], maxBytes: SITEMAP_LIMITS.bytes, timeoutMs: Math.min(options.timeoutMs ?? 5000, 5000), maxRedirects: 3 });
  if (!result.ok) return null;
  let text = result.text;
  if (wantsGz || (result.body[0] === 0x1f && result.body[1] === 0x8b)) {
    try {
      text = zlib.gunzipSync(result.body, { maxOutputLength: SITEMAP_LIMITS.bytes * 4 }).toString('utf8');
    } catch {
      return null;
    }
  }
  // A site that answers every address with its home page has no sitemap there.
  if (result.kind === 'html' && !/^\s*<(?:\?xml|urlset|sitemapindex)/i.test(text)) return null;
  return parseSitemap(text);
};

/**
 * The pages of a site, from its sitemap files (the ones robots.txt names, then the usual /sitemap.xml and /sitemap_index.xml).
 * Reads at most SITEMAP_LIMITS.files files, follows one level of "sitemap index", keeps only addresses on the same site.
 * Never fails: no sitemap simply gives an empty list.
 *
 * @returns {Promise<{ urls: { loc: string, lastmod: string, priority: number }[], files: string[] }>}
 */
export const loadSitemapUrls = async (origin, declared = [], options = {}) => {
  const site = siteOf(origin);
  // Files named by robots.txt first, then the usual places. Files found inside an index are read before the remaining guesses.
  let guesses = [...new Set([...declared, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])].filter((u) => siteOf(u) === site);
  let children = [];
  const seenFiles = new Set();
  const used = [];
  const found = new Map();
  while ((children.length || guesses.length) && used.length < SITEMAP_LIMITS.files) {
    const file = children.length ? children.shift() : guesses.shift();
    if (seenFiles.has(file)) continue;
    seenFiles.add(file);
    const parsed = await readSitemapFile(file, options);
    if (!parsed) continue;
    used.push(file);
    children.push(...parsed.sitemaps.filter((child) => siteOf(child) === site && !seenFiles.has(child)));
    for (const entry of parsed.urls) {
      if (siteOf(entry.loc) !== site || found.size >= SITEMAP_LIMITS.urls) continue;
      if (!found.has(entry.loc)) found.set(entry.loc, entry);
    }
    if (found.size > 0) guesses = []; // a real list of pages was found: the other guesses are not needed (child files of an index still are)
  }
  return { urls: [...found.values()], files: used };
};
