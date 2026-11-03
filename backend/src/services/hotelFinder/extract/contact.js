import { attr, elements, rawText, resolveUrl, squash, where } from './dom.js';
import { normalizeEmail, normalizePhone } from './normalize.js';
import { cand } from './structured.js';

// How to reach the hotel and where it is: phone numbers, e-mail addresses, social pages, the address and the map position, read from
// links (the most reliable: a "tel:" link is a phone number on purpose) and from the words on the page.

// ---- phones ----

const PHONE_SPAN = /(?:\+|00)?\(?\d[\d\s().\-–]{6,22}\d/g;
const PHONE_LABEL = /(?:tel|telephone|phone|ph|call(?:\s+us)?|mobile|mob|cell|whatsapp|contact(?:\s+us)?|reservations?|bookings?|enquir(?:y|ies)|inquir(?:y|ies)|front\s*desk|helpline|toll[\s-]?free|reception)\b[^0-9+(]{0,18}$/i;
const FAX_LABEL = /\bfax\b[^0-9+(]{0,12}$/i;
const PRICE_BEFORE = /(?:₹|rs\.?|inr|usd|\$|€|£|aed|thb|idr|rm|sgd)\s*$/i;

const decodeHref = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const phoneCandidates = (doc, lines) => {
  const out = [];
  for (const a of elements(doc, 'a')) {
    const href = squash(attr(a, 'href'));
    if (/^tel:/i.test(href)) {
      const n = normalizePhone(decodeHref(href.slice(4)).split(';')[0]);
      if (n) out.push(cand('phone', n, 'tel-link', 0.85));
    } else {
      const wa = /^https?:\/\/(?:wa\.me\/|api\.whatsapp\.com\/send\?(?:[^#]*&)?phone=|web\.whatsapp\.com\/send\?phone=)(\d{8,15})/i.exec(href);
      if (wa) {
        const n = normalizePhone(`+${wa[1]}`);
        if (n) out.push(cand('phone', n, 'whatsapp-link', 0.7, { note: 'WhatsApp' }));
      }
    }
  }
  let found = 0;
  lines.forEach((line, index) => {
    if (found >= 12 || line.text.length > 400) return;
    for (const match of line.text.matchAll(PHONE_SPAN)) {
      const before = line.text.slice(Math.max(0, match.index - 30), match.index);
      if (FAX_LABEL.test(before) || PRICE_BEFORE.test(before)) continue;
      const n = normalizePhone(match[0]);
      if (!n) continue;
      const labelled = PHONE_LABEL.test(before) || (before.trim() === '' && index > 0 && PHONE_LABEL.test(`${lines[index - 1].text} `) && lines[index - 1].text.length < 40);
      const international = /^(?:\+|00)/.test(n.display);
      if (!labelled && !international) continue;
      out.push(cand('phone', n, 'text', labelled && international ? 0.65 : labelled ? 0.55 : 0.45));
      found += 1;
    }
  });
  return out;
};

// ---- e-mail ----

const EMAIL_SPAN = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/g;

export const emailCandidates = (doc, lines) => {
  const out = [];
  for (const a of elements(doc, 'a')) {
    const href = squash(attr(a, 'href'));
    if (/^mailto:/i.test(href)) {
      const e = normalizeEmail(decodeHref(href.slice(7)));
      if (e) out.push(cand('email', e, 'mailto-link', 0.85));
    }
  }
  let found = 0;
  for (const line of lines) {
    if (found >= 10 || line.text.length > 600) continue;
    for (const match of line.text.matchAll(EMAIL_SPAN)) {
      const e = normalizeEmail(match[0]);
      if (e) {
        out.push(cand('email', e, 'text', 0.6));
        found += 1;
      }
    }
  }
  return out;
};

// ---- social pages ----

const SOCIAL = [
  ['facebook', /^(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com)$/i, /^\/(?!sharer|share|dialog|plugins|tr\b|login|policies|help|privacy|groups\/?$|events\/?$)[^/]+/i],
  ['instagram', /^(?:www\.)?instagram\.com$/i, /^\/(?!p\/|reel\/|explore|accounts|share)[^/]+/i],
  ['twitter', /^(?:www\.|mobile\.)?(?:twitter\.com|x\.com)$/i, /^\/(?!intent|share|home|search|i\/)[^/]+/i],
  ['youtube', /^(?:www\.|m\.)?youtube\.com$/i, /^\/(?:@[^/]+|channel\/|c\/|user\/)/i],
  ['linkedin', /^(?:[a-z]{2,3}\.)?linkedin\.com$/i, /^\/(?:company|in|school)\/[^/]+/i],
  ['tripadvisor', /^(?:www\.)?tripadvisor\.[a-z.]+$/i, /^\/(?:Hotel_Review|Resort_Review|VacationRentalReview|Hotel|Attraction_Review)[-\w]*/i],
  ['booking', /^(?:www\.)?booking\.com$/i, /^\/hotel\//i],
  ['pinterest', /^(?:www\.)?pinterest\.[a-z.]+$/i, /^\/(?!pin\/create|pin\/|share)[^/]+/i],
  ['tiktok', /^(?:www\.)?tiktok\.com$/i, /^\/@[^/]+/i]
];

export const socialCandidates = (doc, base) => {
  const out = [];
  const seen = new Set();
  for (const a of elements(doc, 'a')) {
    const url = resolveUrl(attr(a, 'href'), base);
    if (!url) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    for (const [network, hostTest, pathTest] of SOCIAL) {
      if (!hostTest.test(parsed.hostname) || !pathTest.test(parsed.pathname)) continue;
      if (/[?&](?:u|url|text|share|sharer)=/i.test(parsed.search) && network !== 'tripadvisor') continue;
      const clean = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(cand('social', { network, url: clean }, 'link', 0.65));
      }
    }
  }
  return out;
};

// ---- address ----

const COUNTRIES = ['India', 'United Arab Emirates', 'UAE', 'Sri Lanka', 'Nepal', 'Bhutan', 'Maldives', 'Thailand', 'Indonesia', 'Malaysia', 'Singapore', 'Vietnam', 'Cambodia', 'Philippines', 'Japan', 'China', 'Hong Kong', 'South Korea', 'Turkey', 'Greece', 'Italy', 'France', 'Spain', 'Portugal', 'Germany', 'Switzerland', 'Austria', 'Netherlands', 'Belgium', 'United Kingdom', 'UK', 'England', 'Scotland', 'Ireland', 'United States', 'USA', 'US', 'Canada', 'Mexico', 'Brazil', 'Australia', 'New Zealand', 'South Africa', 'Kenya', 'Tanzania', 'Egypt', 'Morocco', 'Mauritius', 'Seychelles', 'Oman', 'Qatar', 'Saudi Arabia', 'Bahrain', 'Kuwait', 'Jordan', 'Croatia', 'Czech Republic', 'Poland', 'Russia', 'Denmark', 'Norway', 'Sweden', 'Finland', 'Iceland'];
const COUNTRY_SET = new Map(COUNTRIES.map((c) => [c.toLowerCase(), c]));
const POSTAL = /\b(\d{6}|\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{4})\b/;

/** Splits "Pichola, Udaipur, Rajasthan 313001, India" into what it can: street, locality, region, postal code, country. */
export const addressParts = (full) => {
  const parts = squash(full).split(/\s*,\s*/).filter(Boolean);
  const result = { street: '', locality: '', region: '', postalCode: '', country: '' };
  if (parts.length < 2) return result;
  const last = parts[parts.length - 1].replace(/\.$/, '');
  if (COUNTRY_SET.has(last.toLowerCase())) {
    result.country = COUNTRY_SET.get(last.toLowerCase());
    parts.pop();
  }
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const m = POSTAL.exec(parts[i]);
    if (m && (parts[i].replace(m[0], '').trim().length <= 40)) {
      result.postalCode = m[1];
      const rest = parts[i].replace(m[0], '').replace(/[-–\s]+$/g, '').trim();
      if (rest) parts[i] = rest;
      else parts.splice(i, 1);
      break;
    }
  }
  if (parts.length >= 3) {
    result.region = parts[parts.length - 1];
    result.locality = parts[parts.length - 2];
    result.street = parts.slice(0, -2).join(', ');
  } else if (parts.length === 2) {
    result.locality = parts[1];
    result.street = parts[0];
  } else if (parts.length === 1) {
    result.locality = parts[0];
  }
  return result;
};

const addressNoise = /(?:©|copyright|all rights reserved|cookie|privacy|terms|subscribe|newsletter|₹|\brs\.?\s*\d|\bper night\b|check[- ]?in|check[- ]?out)/i;
const LABEL_LINE = /^(?:our\s+)?(?:hotel\s+|office\s+)?(?:address|location|find\s+us(?:\s+at)?|reach\s+us(?:\s+at)?|how\s+to\s+find\s+us|visit\s+us(?:\s+at)?)\s*[:\-–]\s*(.{10,240})$/i;
const LABEL_ONLY = /^(?:our\s+)?(?:hotel\s+|office\s+)?(?:address|location|find\s+us|reach\s+us|visit\s+us|contact(?:\s+us)?|get\s+in\s+touch)$/i;

const withParts = (full, confidence, source) => {
  const out = [cand('address.full', full, source, confidence)];
  const parts = addressParts(full);
  for (const [key, value] of Object.entries(parts)) if (value) out.push(cand(`address.${key}`, value, source, +(confidence * 0.6).toFixed(3)));
  return out;
};

export const addressCandidates = (doc, lines) => {
  const out = [];
  for (const el of elements(doc, 'address')) {
    const full = squash(rawText(el).replace(/\s*\n\s*/g, ', ')).replace(/^address\s*[:\-–]\s*/i, '');
    if (full.length >= 12 && full.length <= 260 && !addressNoise.test(full)) out.push(...withParts(full, 0.65, 'address-tag'));
  }
  const seen = new Set();
  lines.forEach((line, i) => {
    const m = LABEL_LINE.exec(line.text);
    if (m && !addressNoise.test(m[1]) && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push(...withParts(squash(m[1]), 0.55, 'text'));
      return;
    }
    if (LABEL_ONLY.test(line.text)) {
      const next = [lines[i + 1], lines[i + 2], lines[i + 3], lines[i + 4]].filter(Boolean).map((l) => l.text).filter((t) => !LABEL_ONLY.test(t));
      const block = [];
      for (const t of next) {
        if (t.length > 120 || addressNoise.test(t) || /^(?:phone|tel|email|e-mail|mobile|call|fax|whatsapp)\b/i.test(t) || /@/.test(t)) break;
        block.push(t);
        if (POSTAL.test(t)) {
          const after = lines[i + 1 + block.length]?.text;
          if (after && COUNTRY_SET.has(after.replace(/\.$/, '').toLowerCase())) block.push(after); // the country often has a line of its own
          break;
        }
      }
      const full = block.join(', ');
      if (full.length >= 15 && (full.match(/,/g) || []).length >= 1 && POSTAL.test(full) && !seen.has(full)) {
        seen.add(full);
        out.push(...withParts(full, 0.5, 'text'));
      }
    }
  });
  if (!out.length) {
    for (const line of lines) {
      const t = line.text;
      if (t.length < 20 || t.length > 200 || addressNoise.test(t) || /@|https?:/i.test(t)) continue;
      if (/\b\d{6}\b/.test(t) && (t.match(/,/g) || []).length >= 2) {
        out.push(...withParts(t, 0.4, 'text'));
        break;
      }
    }
  }
  return out.slice(0, 12);
};

// ---- map position ----

const LATLNG = '(-?\\d{1,2}\\.\\d{3,})\\s*,\\s*(-?\\d{1,3}\\.\\d{3,})';
const MAP_PATTERNS = [
  new RegExp(`@${LATLNG}`),
  new RegExp(`[?&](?:q|ll|query|center|destination|daddr|saddr)=(?:loc:)?${LATLNG}`, 'i'),
  new RegExp(`[?&]q=${LATLNG.replace(',', '%2C')}`, 'i')
];

const validGeo = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

export const mapCandidates = (doc, base) => {
  const out = [];
  const urls = [
    ...elements(doc, 'a').map((a) => attr(a, 'href')),
    ...elements(doc, 'iframe').map((f) => attr(f, 'src') || attr(f, 'data-src'))
  ].filter((u) => /(?:google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com|openstreetmap\.org|bing\.com\/maps|waze\.com)/i.test(u));
  for (const raw of urls.slice(0, 20)) {
    const href = decodeHref(raw);
    let lat;
    let lng;
    const embed = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/.exec(href); // Google embed: longitude first
    if (embed) [lng, lat] = [Number(embed[1]), Number(embed[2])];
    else {
      const osm = /[?&#](?:mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)|map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+))/.exec(href);
      if (osm) [lat, lng] = osm[1] ? [Number(osm[1]), Number(osm[2])] : [Number(osm[3]), Number(osm[4])];
      else {
        for (const pattern of MAP_PATTERNS) {
          const m = pattern.exec(href);
          if (m) { [lat, lng] = [Number(m[1]), Number(m[2])]; break; }
        }
      }
    }
    if (validGeo(lat, lng)) out.push(cand('geo', { lat, lng }, 'map-link', 0.7));
  }
  for (const el of where(doc, (n) => n.attribs && (n.attribs['data-lat'] !== undefined || n.attribs['data-latitude'] !== undefined)).slice(0, 5)) {
    const lat = Number(attr(el, 'data-lat') || attr(el, 'data-latitude'));
    const lng = Number(attr(el, 'data-lng') || attr(el, 'data-lon') || attr(el, 'data-longitude'));
    if (validGeo(lat, lng)) out.push(cand('geo', { lat, lng }, 'map-data', 0.5));
  }
  return out;
};
