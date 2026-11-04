import { attr, elements, plainText, rawText, resolveUrl, squash, where } from './dom.js';
import { countryName, nameFromTitle, normalizeEmail, normalizePhone, normalizeTime, parsePriceRange, starsFromText } from './normalize.js';

// The data a page states about itself on purpose: JSON-LD, microdata, and meta tags. This is the most reliable source (the hotel
// wrote it for programs to read), so its candidates carry the highest confidence. A candidate is
// { field, value, source, confidence }: the pipeline later picks the best candidate for each field.

export const cand = (field, value, source, confidence, extra = {}) => ({ field, value, source, confidence, ...extra });

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The text of a value that may be a string, a number, an object with @value/name, or a list of those (the first one). */
const text = (v) => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(text).find(Boolean) || '';
  if (typeof v === 'string') return squash(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isObject(v)) return text(v['@value'] ?? v.name ?? v.value ?? '');
  return '';
};
/** Text for display: decoded, with any markup taken out (a name or an address must never carry tags). */
const label = (v) => plainText(text(v));
const urlOf = (v) => {
  if (Array.isArray(v)) return v.map(urlOf).find(Boolean) || '';
  if (typeof v === 'string') return squash(v);
  if (isObject(v)) return squash(v.url || v.contentUrl || v['@id'] || v['@value'] || '');
  return '';
};
const numberOf = (v) => {
  const n = Number(String(text(v)).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ---- JSON-LD ----

const flatten = (node, out, depth = 0) => {
  if (depth > 6 || node === null || node === undefined) return;
  if (Array.isArray(node)) return node.forEach((n) => flatten(n, out, depth + 1));
  if (!isObject(node)) return;
  out.push(node);
  if (node['@graph']) flatten(node['@graph'], out, depth + 1);
};

/** Every JSON-LD object on the page (graphs flattened). Damaged blocks are skipped, never fatal. */
export const readJsonLd = (doc) => {
  const out = [];
  for (const script of where(doc, (n) => n.name === 'script' && /ld\+json/i.test(attr(n, 'type')))) {
    const body = rawText(script).trim().replace(/^<!--/, '').replace(/-->$/, '').replace(/^\s*\/\*\s*<!\[CDATA\[\s*\*\//, '').replace(/\/\*\s*\]\]>\s*\*\/\s*$/, '').trim();
    if (!body || body.length > 1_000_000) continue;
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      try {
        // eslint-disable-next-line no-control-regex
        json = JSON.parse(body.replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    flatten(json, out);
  }
  return out;
};

const typesOf = (node) => asArray(node['@type']).map((t) => String(t).split(/[/#]/).pop().toLowerCase());

const PROPERTY_TYPES = {
  hotel: 'Hotel', lodgingbusiness: 'Lodging', resort: 'Resort', bedandbreakfast: 'Bed & breakfast', hostel: 'Hostel', motel: 'Motel', vacationrental: 'Vacation rental',
  campground: 'Campground', skiresort: 'Ski resort', guesthouse: 'Guest house', inn: 'Inn', apartment: 'Apartment', house: 'House'
};
const ROOM_TYPES = new Set(['hotelroom', 'room', 'suite', 'accommodation', 'apartment', 'singlefamilyresidence']);

/** Is this entity a place to stay? Returns its property type label, or '' when it is not one. */
export const lodgingLabel = (node) => {
  for (const t of typesOf(node)) if (PROPERTY_TYPES[t]) return PROPERTY_TYPES[t];
  return '';
};

const deref = (value, byId) => {
  if (isObject(value) && Object.keys(value).length === 1 && value['@id'] && byId.has(value['@id'])) return byId.get(value['@id']);
  return value;
};

const addressCandidates = (raw, source, confidence, byId) => {
  const out = [];
  const address = deref(raw, byId);
  if (typeof address === 'string') {
    const full = plainText(address);
    if (full) out.push(cand('address.full', full, source, confidence));
    return out;
  }
  if (!isObject(address)) return out;
  const parts = {
    street: label(address.streetAddress),
    locality: label(address.addressLocality),
    region: label(address.addressRegion),
    postalCode: label(address.postalCode),
    country: countryName(label(address.addressCountry))
  };
  for (const [key, value] of Object.entries(parts)) if (value) out.push(cand(`address.${key}`, value, source, confidence));
  // Some sites put the whole address in the street line: a part already said there is not said twice.
  const said = [];
  const full = [parts.street, parts.locality, parts.region, parts.postalCode, parts.country]
    .filter(Boolean)
    .filter((part) => {
      const dup = said.some((earlier) => earlier.toLowerCase().includes(part.toLowerCase()));
      said.push(part);
      return !dup;
    })
    .join(', ');
  if (full) out.push(cand('address.full', full, source, confidence));
  return out;
};

const ratingCandidate = (value, source, confidence, byId) => {
  const r = deref(value, byId);
  if (!isObject(r)) return null;
  const v = numberOf(r.ratingValue);
  if (v === null || v <= 0) return null;
  const best = numberOf(r.bestRating) || 5;
  if (v > best || best > 100) return null;
  return cand('rating', { value: v, best, count: numberOf(r.reviewCount ?? r.ratingCount) || 0 }, source, confidence);
};

/**
 * What a JSON-LD (or microdata) entity says, as candidates. `lodging` is true for the hotel itself: an organisation or a plain
 * local business is read too, but at a lower confidence, because it may be a company rather than the property.
 */
export const entityCandidates = (node, { source, byId = new Map(), base = '', lodging = true } = {}) => {
  const out = [];
  const k = lodging ? 1 : 0.6;
  const push = (field, value, confidence, extra) => {
    if (value === '' || value === null || value === undefined) return;
    out.push(cand(field, value, source, +(confidence * k).toFixed(3), extra));
  };
  const kind = lodgingLabel(node);
  if (kind) push('propertyType', kind, 0.9);
  push('name', label(node.name), 0.95);
  const description = plainText(text(node.description));
  if (description) push('description', description.slice(0, 2000), 0.9);
  push('tagline', label(node.slogan), 0.6);
  const site = urlOf(node.url);
  if (site) {
    const resolved = resolveUrl(site, base);
    if (resolved) push('website', resolved, 0.7);
  }

  for (const c of addressCandidates(node.address, source, 0.95 * k, byId)) out.push(c);
  const geo = deref(node.geo, byId);
  if (isObject(geo)) {
    const lat = numberOf(geo.latitude);
    const lng = numberOf(geo.longitude);
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) push('geo', { lat, lng }, 0.95);
  }

  const phones = [...asArray(node.telephone), ...asArray(node.contactPoint).flatMap((c) => asArray(deref(c, byId)?.telephone))];
  for (const p of phones) {
    const n = normalizePhone(text(p).replace(/^tel:/i, ''));
    if (n) push('phone', n, 0.9);
  }
  const emails = [...asArray(node.email), ...asArray(node.contactPoint).flatMap((c) => asArray(deref(c, byId)?.email))];
  for (const e of emails) {
    const n = normalizeEmail(text(e));
    if (n) push('email', n, 0.9);
  }

  const star = deref(node.starRating, byId);
  const stars = isObject(star) ? numberOf(star.ratingValue) : numberOf(star);
  if (stars !== null && stars >= 1 && stars <= 5) push('starRating', Math.round(stars), 0.9);
  else {
    const fromAward = starsFromText(asArray(node.award).map(text).join(' '));
    if (fromAward) push('starRating', fromAward, 0.6);
  }
  const rating = ratingCandidate(node.aggregateRating, source, 0.9 * k, byId);
  if (rating) out.push(rating);

  const range = parsePriceRange(text(node.priceRange));
  if (range && range.from > 0) push('price', { currency: range.currency, from: range.from, to: range.to, unit: 'night', kind: 'range', text: text(node.priceRange) }, 0.5);
  else if (range && range.level) push('priceLevel', range.level, 0.5);
  for (const offer of [...asArray(node.makesOffer), ...asArray(node.offers)].map((o) => deref(o, byId)).filter(isObject)) {
    const price = numberOf(offer.price ?? offer.lowPrice);
    const high = numberOf(offer.highPrice) ?? price;
    const currency = text(offer.priceCurrency);
    if (price && price > 0) push('price', { currency, from: price, to: Math.max(price, high || price), unit: 'night', kind: 'offer', text: '' }, 0.7);
  }

  for (const feature of asArray(node.amenityFeature)) {
    const f = deref(feature, byId);
    const name = label(isObject(f) ? f.name : f);
    const value = isObject(f) ? f.value : true;
    if (name && value !== false && String(value).toLowerCase() !== 'false' && name.length <= 80) push('amenity', name, 0.85);
  }
  if (node.petsAllowed === true || /^(?:true|yes)$/i.test(text(node.petsAllowed))) push('amenity', 'Pets allowed', 0.8);
  if (node.petsAllowed === false || /^(?:false|no)$/i.test(text(node.petsAllowed))) push('petsPolicy', 'Pets are not allowed', 0.8);

  const checkIn = normalizeTime(text(node.checkinTime));
  const checkOut = normalizeTime(text(node.checkoutTime));
  if (checkIn) push('checkIn', checkIn, 0.9);
  if (checkOut) push('checkOut', checkOut, 0.9);
  const rooms = numberOf(node.numberOfRooms);
  if (rooms && rooms > 0 && rooms < 5000) push('roomCount', rooms, 0.8);

  for (const link of asArray(node.sameAs)) {
    const u = resolveUrl(text(link), base);
    if (u) push('social', { url: u }, 0.8);
  }
  for (const image of asArray(node.image)) {
    const i = deref(image, byId);
    const u = resolveUrl(urlOf(i), base);
    if (u) push('image', { url: u, alt: isObject(i) ? text(i.caption || i.name || i.description) : '', width: isObject(i) ? numberOf(i.width) || 0 : 0, height: isObject(i) ? numberOf(i.height) || 0 : 0, role: 'structured' }, 0.8);
  }
  const logo = resolveUrl(urlOf(deref(node.logo, byId)), base);
  if (logo) push('logo', logo, 0.8);

  for (const place of [...asArray(node.containsPlace), ...asArray(node.hasPart), ...asArray(node.accommodation), ...asArray(node.amenityFeature)].map((p) => deref(p, byId)).filter(isObject)) {
    if (!typesOf(place).some((t) => ROOM_TYPES.has(t))) continue;
    const name = label(place.name);
    if (!name) continue;
    const bits = [plainText(text(place.description)).slice(0, 200), label(deref(place.bed, byId)?.typeOfBed ?? place.bed), numberOf(place.occupancy?.maxValue) ? `Sleeps ${numberOf(place.occupancy.maxValue)}` : '', text(place.floorSize?.value) ? `${text(place.floorSize.value)} ${text(place.floorSize.unitCode) || 'sq m'}` : ''].filter(Boolean);
    push('room', { name: name.slice(0, 80), details: bits.join('. ').slice(0, 200) }, 0.85);
  }
  return out;
};

/** All the candidates from the JSON-LD on a page. The hotel entity first (its facts are trusted most), then organisations and places. */
export const jsonLdCandidates = (doc, base) => {
  const nodes = readJsonLd(doc);
  const byId = new Map();
  for (const n of nodes) if (n['@id']) byId.set(n['@id'], n);
  const out = [];
  for (const node of nodes) {
    const types = typesOf(node);
    const lodging = lodgingLabel(node) !== '';
    const organisation = types.some((t) => ['organization', 'localbusiness', 'place', 'touristattraction', 'travelagency', 'website', 'webpage', 'corporation'].includes(t));
    if (lodging) out.push(...entityCandidates(node, { source: 'json-ld', byId, base, lodging: true }));
    else if (organisation && types.some((t) => t !== 'website' && t !== 'webpage')) out.push(...entityCandidates(node, { source: 'json-ld', byId, base, lodging: false }));
    else if (types.includes('website') && text(node.name)) out.push(cand('name', text(node.name), 'json-ld', 0.4));
  }
  return out;
};

// ---- microdata ----

const valueOfItemprop = (el) => {
  const name = el.name;
  if (name === 'meta') return attr(el, 'content');
  if (['a', 'link', 'area'].includes(name)) return attr(el, 'href');
  if (['img', 'source', 'audio', 'video', 'iframe', 'embed'].includes(name)) return attr(el, 'src');
  if (name === 'time') return attr(el, 'datetime') || squash(rawText(el));
  if (name === 'data' || name === 'meter') return attr(el, 'value');
  return attr(el, 'content') || squash(rawText(el));
};

const buildItem = (el) => {
  const item = { '@type': attr(el, 'itemtype').split(/\s+/).map((t) => t.split(/[/#]/).pop()).filter(Boolean) };
  const visit = (node) => {
    for (const child of node.children || []) {
      if (child.type !== 'tag') continue;
      const prop = attr(child, 'itemprop');
      const nested = child.attribs?.itemscope !== undefined;
      if (prop) {
        const value = nested ? buildItem(child) : valueOfItemprop(child);
        for (const name of prop.split(/\s+/)) (item[name] ||= []).push(value);
      }
      if (!nested) visit(child);
    }
  };
  visit(el);
  return item;
};

/** Microdata items (itemscope + itemtype) that are lodgings or organisations, as candidates. */
export const microdataCandidates = (doc, base) => {
  const items = where(doc, (n) => n.attribs?.itemscope !== undefined && attr(n, 'itemtype'));
  const out = [];
  const seen = new Set();
  for (const el of items) {
    // only items that are not themselves inside another item (those are read as part of their parent)
    let parent = el.parent;
    let inside = false;
    while (parent) {
      if (parent.attribs?.itemscope !== undefined) { inside = true; break; }
      parent = parent.parent;
    }
    if (inside || seen.has(el)) continue;
    seen.add(el);
    const node = buildItem(el);
    // microdata properties are lists; the shared reader wants single values where schema.org has one
    const flat = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, key === '@type' || value.length > 1 ? value : value[0]]));
    const lodging = lodgingLabel(flat) !== '';
    if (lodging) out.push(...entityCandidates(flat, { source: 'microdata', base, lodging: true }));
    else if (typesOf(flat).some((t) => ['organization', 'localbusiness', 'place'].includes(t))) out.push(...entityCandidates(flat, { source: 'microdata', base, lodging: false }));
  }
  return out;
};

// ---- meta tags ----

/** All meta tags as a map: name -> [content ...]; names and properties are lower case. */
export const readMeta = (doc) => {
  const meta = new Map();
  for (const tag of elements(doc, 'meta')) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop') || attr(tag, 'http-equiv')).toLowerCase();
    const content = squash(attr(tag, 'content'));
    if (!key || !content) continue;
    (meta.get(key) || meta.set(key, []).get(key)).push(content);
  }
  return meta;
};

const firstOf = (meta, ...keys) => {
  for (const key of keys) {
    const v = meta.get(key)?.[0];
    if (v) return v;
  }
  return '';
};

export const metaCandidates = (doc, base) => {
  const meta = readMeta(doc);
  const out = [];
  const title = squash(rawText(elements(doc, 'title')[0] || { children: [] }));
  const siteName = firstOf(meta, 'og:site_name', 'application-name', 'apple-mobile-web-app-title');
  if (siteName && siteName.length <= 100) out.push(cand('name', siteName, 'meta', 0.55));
  const ogTitle = nameFromTitle(firstOf(meta, 'og:title', 'twitter:title'));
  if (ogTitle) out.push(cand('name', ogTitle, 'meta', 0.5));
  const fromTitle = nameFromTitle(title);
  if (fromTitle) out.push(cand('name', fromTitle, 'title', 0.45));
  const description = plainText(firstOf(meta, 'description', 'og:description', 'twitter:description'));
  if (description) out.push(cand('description', description.slice(0, 2000), 'meta', 0.6));
  const ogDescription = plainText(firstOf(meta, 'og:description'));
  if (ogDescription && ogDescription !== description) out.push(cand('description', ogDescription.slice(0, 2000), 'meta', 0.55));

  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
    for (const value of meta.get(key) || []) {
      const u = resolveUrl(value, base);
      if (u) out.push(cand('image', { url: u, alt: firstOf(meta, 'og:image:alt', 'twitter:image:alt'), width: Number(firstOf(meta, 'og:image:width')) || 0, height: Number(firstOf(meta, 'og:image:height')) || 0, role: 'cover' }, 'meta', 0.75));
    }
  }
  const street = firstOf(meta, 'business:contact_data:street_address', 'og:street-address');
  const locality = firstOf(meta, 'business:contact_data:locality', 'og:locality', 'geo.placename');
  const region = firstOf(meta, 'business:contact_data:region', 'og:region', 'geo.region');
  const postal = firstOf(meta, 'business:contact_data:postal_code', 'og:postal-code');
  const country = firstOf(meta, 'business:contact_data:country_name', 'og:country-name');
  for (const [field, value] of [['street', street], ['locality', locality], ['region', region], ['postalCode', postal], ['country', country]]) if (value) out.push(cand(`address.${field}`, value, 'meta', 0.75));
  const phone = normalizePhone(firstOf(meta, 'business:contact_data:phone_number', 'og:phone_number'));
  if (phone) out.push(cand('phone', phone, 'meta', 0.75));
  const email = normalizeEmail(firstOf(meta, 'business:contact_data:email', 'og:email'));
  if (email) out.push(cand('email', email, 'meta', 0.75));
  const site = resolveUrl(firstOf(meta, 'business:contact_data:website'), base);
  if (site) out.push(cand('website', site, 'meta', 0.6));

  const num = (v) => (v === '' ? NaN : Number(v)); // a missing tag is "no number", not zero
  let lat = num(firstOf(meta, 'place:location:latitude', 'og:latitude'));
  let lng = num(firstOf(meta, 'place:location:longitude', 'og:longitude'));
  const pair = firstOf(meta, 'geo.position', 'icbm');
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && pair) {
    const m = /(-?\d{1,2}(?:\.\d+)?)\s*[;,]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(pair);
    if (m) [lat, lng] = [Number(m[1]), Number(m[2])];
  }
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) out.push(cand('geo', { lat, lng }, 'meta', 0.75));

  const stars = starsFromText(`${title} ${firstOf(meta, 'description', 'og:description')}`);
  if (stars) out.push(cand('starRating', stars, 'meta', 0.55));
  return out;
};

// ---- data embedded in scripts (Next.js, Nuxt, plain JSON) ----

const STATE_KEYS = /^(?:phone|phonenumber|telephone|mobile|contactnumber|email|emailaddress|contactemail)$/i;

/** Phone numbers, e-mail addresses and coordinates found in script data (`__NEXT_DATA__` and the like). Low confidence: it is not clear what they belong to. */
export const embeddedStateCandidates = (doc) => {
  const out = [];
  const scripts = where(doc, (n) => n.name === 'script' && (attr(n, 'id') === '__NEXT_DATA__' || attr(n, 'type') === 'application/json' || attr(n, 'id') === '__NUXT_DATA__'));
  let budget = 40_000;
  for (const script of scripts.slice(0, 6)) {
    const body = rawText(script).trim();
    if (!body || body.length > 1_500_000) continue;
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    const walk = (node, depth) => {
      if (budget-- < 0 || depth > 14 || node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.slice(0, 300).forEach((n) => walk(n, depth + 1));
      const lat = numberOf(node.latitude ?? node.lat);
      const lng = numberOf(node.longitude ?? node.lng ?? node.lon);
      if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) && (node.latitude !== undefined || node.longitude !== undefined)) out.push(cand('geo', { lat, lng }, 'embedded-json', 0.4));
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && STATE_KEYS.test(key)) {
          if (/mail/i.test(key)) {
            const e = normalizeEmail(value);
            if (e) out.push(cand('email', e, 'embedded-json', 0.4));
          } else {
            const p = normalizePhone(value);
            if (p) out.push(cand('phone', p, 'embedded-json', 0.4));
          }
        } else if (value && typeof value === 'object') walk(value, depth + 1);
      }
    };
    walk(json, 0);
  }
  return out;
};

