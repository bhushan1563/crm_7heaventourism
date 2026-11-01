// Pure helpers shared by the Word and PDF exports (no React, no network), so they can be tested thoroughly.
import { looksLikeHtml, plainToHtml, sanitizeForDisplay } from './richText';
import { formatDuration } from './itinerary';

/** "Bali Honeymoon: Ubud & Seminyak" -> "bali-honeymoon-ubud-seminyak" (safe in a file name on every system). */
export const slugify = (text, fallback = 'itinerary') =>
  String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;

/** The stored text (formatted or plain) as the top-level blocks of safe HTML: [{ tag: 'p'|'ul'|'ol', html }]. */
export const richBlocks = (value) => {
  const html = looksLikeHtml(value) ? sanitizeForDisplay(value) : plainToHtml(value);
  if (!html) return [];
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const blocks = [];
  let loose = '';
  const flush = () => {
    if (loose.trim()) blocks.push({ tag: 'p', html: loose });
    loose = '';
  };
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === 1 && ['P', 'UL', 'OL'].includes(node.tagName)) {
      flush();
      blocks.push({ tag: node.tagName.toLowerCase(), html: node.tagName === 'P' ? node.innerHTML : node.outerHTML });
    } else loose += node.nodeType === 1 ? node.outerHTML : (node.textContent || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }
  flush();
  return blocks;
};

/**
 * Photos laid out in rows for a page: wide photos get a row of their own, others pair up. Each entry carries the share of
 * the row width it should take, so rows look balanced whatever the photo shapes are.
 * @returns {{ photo: object, share: number }[][]}
 */
export const photoRows = (photos = [], maxPerRow = 2) => {
  const rows = [];
  let row = [];
  const flush = () => {
    if (!row.length) return;
    const total = row.reduce((sum, p) => sum + p.width / p.height, 0); // rows of equal height: width in proportion to the aspect ratio
    rows.push(row.map((photo) => ({ photo, share: photo.width / photo.height / total })));
    row = [];
  };
  for (const photo of photos) {
    const wide = photo.width / photo.height >= 1.9;
    if (wide) {
      flush();
      row = [photo];
      flush();
    } else {
      row.push(photo);
      if (row.length >= maxPerRow) flush();
    }
  }
  flush();
  return rows;
};

/**
 * Packs blocks onto pages. `blocks` is [{ height, keepWithNext }] in reading order; a page holds `capacity` of height.
 * A block marked keepWithNext (a day heading) is never left alone at the bottom of a page. A block taller than a whole
 * page gets a page to itself (the caller shrinks such blocks beforehand).
 * @returns {number[][]} indexes of the blocks on each page
 */
export const packBlocks = (blocks, capacity) => {
  const pages = [];
  let current = [];
  let used = 0;
  const startPage = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };
  for (let i = 0; i < blocks.length; i += 1) {
    const { height } = blocks[i];
    // A heading needs room for itself AND everything that must stay with it: headings can follow each other ("Day by day",
    // then the day's heading), so the chain runs on to the first ordinary block after the last heading.
    let needed = height;
    for (let j = i; blocks[j]?.keepWithNext && blocks[j + 1]; j += 1) needed += blocks[j + 1].height;
    needed = Math.min(needed, capacity);
    if (current.length && used + needed > capacity) startPage();
    current.push(i);
    used += height;
  }
  if (current.length) pages.push(current);
  return pages;
};

/** The small line under a day's title ("Overnight: Ubud  •  Meals: Dinner"), or '' when the day has neither. */
export const dayMeta = (day) =>
  [day.stay && `Overnight: ${day.stay}`, day.meals && `Meals: ${day.meals}`]
    .filter(Boolean)
    .join('  •  ');

/** Everything the exports print, in one place so Word and PDF always agree. */
export const documentFacts = (itinerary) => ({
  title: itinerary.title || 'Itinerary',
  where: [itinerary.destination, itinerary.country].filter(Boolean).join(', '),
  duration: formatDuration(itinerary.nights),
  fileBase: `${slugify(itinerary.title)}-itinerary`
});
