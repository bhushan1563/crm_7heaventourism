import { attr, cleanDisplay, elements, parseHtml, rawText, squash, visibleLines } from './dom.js';
import { addressCandidates, emailCandidates, mapCandidates, phoneCandidates, socialCandidates } from './contact.js';
import { amenityCandidates, descriptionCandidates, headingNameCandidates, policyCandidates, priceCandidates, ratingTextCandidates, roomCandidates, starCandidates, timeCandidates } from './details.js';
import { imageCandidates } from './images.js';
import { collectLinks } from './links.js';
import { embeddedStateCandidates, jsonLdCandidates, metaCandidates, microdataCandidates } from './structured.js';

export { collectLinks } from './links.js';
export { rankPages } from './links.js';

// Reads one page into facts about the hotel. Every extractor is independent and guarded: if one breaks on an odd page, the others
// still give their facts and the page reports which one failed, instead of the whole find failing.

const EXTRACTORS = [
  ['json-ld', (ctx) => jsonLdCandidates(ctx.doc, ctx.url)],
  ['microdata', (ctx) => microdataCandidates(ctx.doc, ctx.url)],
  ['meta', (ctx) => metaCandidates(ctx.doc, ctx.url)],
  ['embedded', (ctx) => embeddedStateCandidates(ctx.doc)],
  ['phones', (ctx) => phoneCandidates(ctx.doc, ctx.lines)],
  ['emails', (ctx) => emailCandidates(ctx.doc, ctx.lines)],
  ['social', (ctx) => socialCandidates(ctx.doc, ctx.url)],
  ['address', (ctx) => addressCandidates(ctx.doc, ctx.lines)],
  ['map', (ctx) => mapCandidates(ctx.doc, ctx.url)],
  ['heading', (ctx) => headingNameCandidates(ctx.lines)],
  ['stars', (ctx) => starCandidates(ctx.doc, ctx.lines)],
  ['times', (ctx) => timeCandidates(ctx.lines)],
  ['amenities', (ctx) => amenityCandidates(ctx.lines)],
  ['rooms', (ctx) => roomCandidates(ctx.lines)],
  ['prices', (ctx) => priceCandidates(ctx.lines)],
  ['policies', (ctx) => policyCandidates(ctx.lines)],
  ['rating', (ctx) => ratingTextCandidates(ctx.lines)],
  ['description', (ctx) => descriptionCandidates(ctx.lines)],
  ['images', (ctx) => imageCandidates(ctx.doc, ctx.url)]
];

/** The address the page says its links are relative to (<base href>), else the page's own address. */
const baseOf = (doc, url) => {
  const tag = elements(doc, 'base')[0];
  const href = tag ? attr(tag, 'href') : '';
  if (!href) return url;
  try {
    const resolved = new URL(href, url);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.href : url;
  } catch {
    return url;
  }
};

// Fields whose value is text meant for people (never an address or a number): all of it is cleaned of markup before it leaves here.
const TEXT_FIELDS = new Set(['name', 'description', 'tagline', 'propertyType', 'amenity', 'address.full', 'address.street', 'address.locality', 'address.region', 'address.postalCode', 'address.country', 'petsPolicy', 'policy.cancellation', 'policy.children', 'policy.pets']);

const sanitize = (c) => {
  if (TEXT_FIELDS.has(c.field) && typeof c.value === 'string') {
    const value = cleanDisplay(c.value);
    return value ? { ...c, value } : null;
  }
  if (c.field === 'room') {
    const name = cleanDisplay(c.value.name);
    return name ? { ...c, value: { name, details: cleanDisplay(c.value.details) } } : null;
  }
  if (c.field === 'image') return { ...c, value: { ...c.value, alt: cleanDisplay(c.value.alt) } };
  if (c.field === 'price') return { ...c, value: { ...c.value, text: cleanDisplay(c.value.text) } };
  return c;
};

/**
 * @param {{ url: string, html: string, source?: string }} input   `source` is "paste" for text a person pasted (links are not followed then)
 * @returns {{
 *   page: { url: string, title: string, lang: string, headings: string[], textChars: number, scriptDrawn: boolean },
 *   candidates: { field: string, value: any, source: string, confidence: number, page: string }[],
 *   links: { url: string, text: string }[],
 *   failed: string[]
 * }}
 */
export const extractPage = ({ url, html }) => {
  const doc = parseHtml(html);
  const base = baseOf(doc, url);
  const lines = visibleLines(doc);
  const ctx = { doc, url: base, lines };
  const candidates = [];
  const failed = [];
  for (const [name, run] of EXTRACTORS) {
    try {
      for (const c of run(ctx)) {
        const clean = sanitize(c);
        if (clean) candidates.push({ ...clean, page: url });
      }
    } catch {
      failed.push(name);
    }
  }
  const title = squash(rawText(elements(doc, 'title')[0] || { children: [] })).slice(0, 200);
  const htmlTag = elements(doc, 'html')[0];
  const textChars = lines.reduce((n, l) => n + l.text.length, 0);
  const scripts = elements(doc, 'script').length;
  let links = [];
  try {
    links = collectLinks(doc, base);
  } catch {
    failed.push('links');
  }
  return {
    page: {
      url,
      title,
      lang: htmlTag ? attr(htmlTag, 'lang').toLowerCase().slice(0, 12) : '',
      headings: lines.filter((l) => l.heading).slice(0, 12).map((l) => l.text.slice(0, 120)),
      textChars,
      // Almost no words but plenty of scripts and an empty app container: the page is drawn by scripts in the browser.
      scriptDrawn: textChars < 500 && scripts >= 3 && /id=["'](?:root|__next|app|__nuxt)["']/i.test(String(html).slice(0, 200_000))
    },
    candidates,
    links,
    failed
  };
};
