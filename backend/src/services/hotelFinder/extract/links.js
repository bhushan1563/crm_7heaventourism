import { attr, elements, rawText, resolveUrl, squash } from './dom.js';
import { siteOf } from '../addressGuard.js';

// Which other pages of the hotel's site are worth reading. A hotel's contact, rooms and facilities pages hold most of what the home
// page lacks, so pages are ranked by what their address and link text say, and only a few are read.

export const PAGE_KINDS = [
  ['contact', 100, /(?:contact|reach[-_ ]?us|get[-_ ]?in[-_ ]?touch|enquir|inquir|find[-_ ]?us|how[-_ ]?to[-_ ]?reach|directions|location|map)/i],
  ['rooms', 80, /(?:\brooms?\b|suites?|accommodations?|villas?|cottages?|stay|tents?|cabins?)/i],
  ['about', 65, /(?:about|overview|our[-_ ]?story|the[-_ ]?hotel|hotel[-_ ]?info|property|welcome|history|heritage)/i],
  ['facilities', 55, /(?:facilit|amenit|services|dining|restaurants?|spa|wellness|experiences?|activities|features)/i],
  ['rates', 50, /(?:rates?|tariff|pricing|packages?|offers?|deals?)/i],
  ['policies', 40, /(?:polic|faq|terms|conditions|cancellation|check[-_ ]?in)/i],
  ['gallery', 35, /(?:gallery|photos?|images|media)/i]
];

const SKIP_PATH = /(?:\/(?:blog|news|press|careers?|jobs|login|signin|register|account|cart|checkout|wp-(?:admin|json|login|content|includes)|feed|tag|category|author|search|privacy|sitemap)\b|\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)(?:$|\?)|[?&](?:replytocom|share|print|format=feed)=|\/page\/\d+|\/(?:fr|de|es|it|ru|zh|ja|ko|ar|pt|nl|tr|th)\/)/i;
const BOOKING_ENGINE = /(?:booking\.com|expedia|agoda|makemytrip|goibibo|hotels\.com|tripadvisor|airbnb|cleartrip|yatra|travelocity|trivago|synxis|travelclick|windsurfercrs|bookingengine|reservations?\.|\/book(?:ing)?[-_/]?(?:now|online|engine|room)?\b)/i;

/** The same-site links of a page: [{ url, text }], each address once, without fragments. */
export const collectLinks = (doc, base) => {
  const site = siteOf(base);
  const seen = new Set();
  const out = [];
  for (const a of elements(doc, 'a')) {
    const url = resolveUrl(attr(a, 'href'), base);
    if (!url || siteOf(url) !== site || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: squash(rawText(a) || attr(a, 'title') || attr(a, 'aria-label')).slice(0, 80) });
    if (out.length >= 400) break;
  }
  return out;
};

const keyOf = (url) => {
  try {
    const u = new URL(url);
    return `${siteOf(u.hostname)}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return url;
  }
};

/**
 * Chooses up to `limit` pages to read, best first, never the start page itself. `links` are from pages already read, `sitemap` are
 * entries from the site's sitemap. Each choice says why: { url, kind, score }.
 */
export const rankPages = ({ start, links = [], sitemap = [], limit = 6 }) => {
  const startKey = keyOf(start);
  const best = new Map();
  const consider = (url, text, bonus) => {
    const key = keyOf(url);
    if (key === startKey || SKIP_PATH.test(url) || BOOKING_ENGINE.test(url)) return;
    let path;
    try {
      path = new URL(url).pathname;
    } catch {
      return;
    }
    const depth = path.split('/').filter(Boolean).length;
    if (depth > 4) return;
    for (const [kind, weight, pattern] of PAGE_KINDS) {
      if (!pattern.test(path) && !pattern.test(text)) continue;
      const score = weight + bonus - depth * 3 + (pattern.test(text) ? 4 : 0);
      const current = best.get(key);
      if (!current || score > current.score) best.set(key, { url, kind, score });
      break;
    }
  };
  for (const link of links) consider(link.url, link.text || '', 8); // a link a visitor can click is more telling than a sitemap line
  for (const entry of sitemap) consider(entry.loc, '', 0);
  // Take the best page of each kind first, so one kind (five "rooms" pages) cannot crowd out the others.
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  const chosen = [];
  const kinds = new Set();
  for (const item of ranked) if (!kinds.has(item.kind) && chosen.length < limit) { kinds.add(item.kind); chosen.push(item); }
  for (const item of ranked) if (!chosen.includes(item) && chosen.length < limit) chosen.push(item);
  return chosen;
};
