import { attr, elements, resolveUrl, squash, where } from './dom.js';
import { cand } from './structured.js';

// Pictures on the page: the ones that look like photos of the hotel (rooms, views, the building), not logos, icons, badges or
// tracking pixels. Only addresses are collected here; nothing is downloaded (the picture proxy does that, one picture at a time,
// with the same safety checks as pages).

const NOT_A_PHOTO = /(?:logo|icon|sprite|favicon|avatar|flag|emoji|badge|payment|visa|mastercard|paypal|trustpilot|social|arrow|loader|loading|spinner|placeholder|blank|pixel|spacer|1x1|button|captcha|qr[-_]?code|marker|play[-_]?button|certificate|cookie|whatsapp|facebook|instagram|twitter|youtube|linkedin|tripadvisor|banner[-_]?ad|\/ads?\/|gravatar|emoticon|stars?[-_.]|rating[-_.]|award|seal|ribbon)/i;
const BAD_EXTENSION = /\.(?:svg|gif|ico|bmp|tiff?|avif|heic|heif|pdf|mp4|webm)(?:$|[?#])/i;
const CONTEXT_HINT = /(?:gallery|slider|carousel|swiper|slide|hero|banner|room|suite|villa|photo|lightbox|masonry|grid|featured|cover)/i;
const ROOM_HINT = /(?:room|suite|villa|cottage|accommodation)/i;

export const IMAGE_LIMITS = { perPage: 60 };

/** Picks the largest address of a srcset ("a.jpg 400w, b.jpg 1200w" or "a.jpg 1x, b.jpg 2x"). */
export const bestFromSrcset = (srcset) => {
  let best = { url: '', weight: -1, width: 0 };
  for (const part of String(srcset || '').split(/,\s+(?=\S)/)) {
    const [url, descriptor = ''] = squash(part).split(' ');
    if (!url) continue;
    const w = /^(\d+)w$/.exec(descriptor);
    const x = /^(\d+(?:\.\d+)?)x$/.exec(descriptor);
    const weight = w ? Number(w[1]) : x ? Number(x[1]) * 1000 : 1;
    if (weight > best.weight) best = { url, weight, width: w ? Number(w[1]) : 0 };
  }
  return best.url ? best : null;
};

const sizeKey = (url) => {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const inner = u.searchParams.get('url') || u.searchParams.get('src'); // image proxies: /_next/image?url=...
  if (inner && /^https?:|^\//.test(inner)) {
    try {
      u = new URL(inner, u);
    } catch { /* keep u */ }
  }
  const path = u.pathname
    .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/i, '')
    .replace(/[_-](?:thumb|thumbnail|small|medium|large|scaled|\d{2,4}w|\d{2,4}x\d{2,4})(?=\.\w+$)/i, '')
    .replace(/\/(?:w|h|width|height|resize|fit|c)_?\d{2,4}(?:,[a-z]_?\d{2,4})*(?=\/)/gi, '');
  return `${u.hostname}${path}`;
};

const ancestorsText = (node, depth = 5) => {
  const bits = [];
  for (let n = node.parent; n && depth > 0; n = n.parent, depth -= 1) bits.push(`${attr(n, 'class')} ${attr(n, 'id')}`);
  return bits.join(' ');
};

const dimension = (value) => {
  const n = parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

export const imageCandidates = (doc, base) => {
  const seen = new Map();
  const order = [];
  const add = (rawUrl, { alt = '', width = 0, height = 0, context = '', source }) => {
    const url = resolveUrl(rawUrl, base);
    if (!url || url.length > 800 || BAD_EXTENSION.test(url)) return;
    if (NOT_A_PHOTO.test(url) || NOT_A_PHOTO.test(alt) || /(?:^|\s)(?:logo|icon|avatar|badge)(?:\s|$)/i.test(context)) return;
    if ((width && width < 200) || (height && height < 120) || (width && height && width * height < 40_000)) return;
    const key = sizeKey(url);
    const role = ROOM_HINT.test(context) || ROOM_HINT.test(alt) ? 'room' : CONTEXT_HINT.test(context) ? 'gallery' : 'page';
    const weight = (width || 0) * (height || width || 0);
    const entry = seen.get(key);
    if (entry) {
      if (weight > entry.weight || (!entry.alt && alt)) Object.assign(entry, { url: weight > entry.weight ? url : entry.url, weight: Math.max(weight, entry.weight), width: width || entry.width, height: height || entry.height, alt: entry.alt || alt });
      return;
    }
    const record = { url, alt: squash(alt).slice(0, 160), width, height, weight, role, source };
    seen.set(key, record);
    order.push(record);
  };

  for (const img of elements(doc, 'img')) {
    const context = ancestorsText(img);
    const attrs = `${attr(img, 'class')} ${attr(img, 'id')} ${context}`;
    const set = bestFromSrcset(attr(img, 'srcset') || attr(img, 'data-srcset') || attr(img, 'data-lazy-srcset'));
    const direct = attr(img, 'data-src') || attr(img, 'data-lazy-src') || attr(img, 'data-original') || attr(img, 'data-lazy') || attr(img, 'data-full') || attr(img, 'data-large') || attr(img, 'src');
    const raw = set?.url || direct;
    if (!raw || /^data:/i.test(raw)) {
      if (!set) continue;
    }
    add(raw, { alt: attr(img, 'alt') || attr(img, 'title'), width: dimension(attr(img, 'width')) || set?.width || 0, height: dimension(attr(img, 'height')), context: attrs, source: 'img' });
  }
  for (const source of elements(doc, 'source')) {
    const set = bestFromSrcset(attr(source, 'srcset') || attr(source, 'data-srcset'));
    if (set) add(set.url, { width: set.width, context: ancestorsText(source), source: 'picture' });
  }
  for (const el of where(doc, (n) => n.attribs && (n.attribs.style?.includes('url(') || n.attribs['data-bg'] || n.attribs['data-background'] || n.attribs['data-image'])).slice(0, 80)) {
    const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(attr(el, 'style'));
    const raw = m ? m[1] : attr(el, 'data-bg') || attr(el, 'data-background') || attr(el, 'data-image');
    if (raw) add(raw, { context: `${attr(el, 'class')} ${ancestorsText(el, 3)}`, source: 'background' });
  }
  for (const link of elements(doc, 'link')) {
    if (/image_src/i.test(attr(link, 'rel'))) add(attr(link, 'href'), { context: 'cover', source: 'link' });
  }

  return order.slice(0, IMAGE_LIMITS.perPage).map((r, index) => {
    const size = r.weight >= 640 * 400 ? 0.12 : r.weight >= 300 * 200 ? 0.05 : 0;
    const roleBoost = r.role === 'room' ? 0.1 : r.role === 'gallery' ? 0.08 : 0;
    const early = index < 6 ? 0.06 : 0;
    return cand('image', { url: r.url, alt: r.alt, width: r.width, height: r.height, role: r.role }, r.source, +Math.min(0.85, 0.45 + size + roleBoost + early + (r.alt ? 0.03 : 0)).toFixed(3));
  });
};
