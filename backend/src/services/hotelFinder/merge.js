import { siteOf } from './addressGuard.js';
import { addressParts } from './extract/contact.js';
import { cleanDisplay } from './extract/dom.js';
import { countryName } from './extract/normalize.js';

// Many pages and many methods each give their own candidates for "the name", "the phone number" ...; this chooses the best of each and
// says how sure it is. Sources that agree make a fact more certain (two independent sources are more believable than one); a single
// weak source stays "low". Pure functions, no network, so every rule is tested on its own.

export const STAR_RATINGS = ['5 star', '4 star', '3 star', '2 star', 'Heritage / Palace', 'Resort / Villa', 'Unrated'];

/** A phone number written the way people write it: "+919829012345" becomes "+91 98290 12345" (India) and "+12125550147" "+1 (212) 555-0147". Others are left as found. */
export const formatPhone = (display, digits) => {
  if (/[\s()-]/.test(display)) return display;
  if (/^\+91\d{10}$/.test(display)) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (/^\+1\d{10}$/.test(display)) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return display;
};

export const levelOf = (confidence) => (confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'medium' : 'low');

const round3 = (n) => Math.round(n * 1000) / 1000;
const keyText = (value) => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

/** Independent sources: the chance that at least one is right is 1 - (1 - a)(1 - b)... */
const noisyOr = (list) => 1 - list.reduce((acc, c) => acc * (1 - c), 1);

const PAGE_WEIGHT = { start: 1, contact: 1, default: 0.92 };

/** Groups candidates of one field by a key, and scores each group; the best first. */
const rank = (candidates, keyOf, pageKinds = new Map()) => {
  const groups = new Map();
  for (const c of candidates) {
    const key = keyOf(c.value);
    if (!key) continue;
    const weight = PAGE_WEIGHT[pageKinds.get(c.page)] ?? PAGE_WEIGHT.default;
    const group = groups.get(key) || { key, items: [], value: c.value, best: c };
    group.items.push({ confidence: Math.min(1, c.confidence * weight), source: c.source, page: c.page });
    if (c.confidence > group.best.confidence) {
      group.best = c;
      group.value = c.value;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => {
      // the same source on the same page repeated is one witness, not several
      const witnesses = new Map();
      for (const item of g.items) witnesses.set(`${item.source}|${item.page}`, Math.max(witnesses.get(`${item.source}|${item.page}`) || 0, item.confidence));
      // Several sources of one page are not fully independent (a title, a heading and a meta tag are all written by the same hand), so
      // agreement counts for less than the full "independent witnesses" sum.
      const levels = [...witnesses.values()];
      const strongest = Math.max(...levels);
      const confidence = round3(Math.min(0.99, strongest + (noisyOr(levels) - strongest) * 0.7));
      return { key: g.key, value: g.value, confidence, sources: [...new Set(g.items.map((i) => i.source))], agree: witnesses.size, top: g.best.confidence };
    })
    .sort((a, b) => b.confidence - a.confidence || b.top - a.top);
};

const info = (g) => (g ? { source: g.sources[0], sources: g.sources, confidence: g.confidence, level: levelOf(g.confidence), agree: g.agree } : null);

// ---- cleaning ----

const GENERIC_NAME = /^(?:home|homepage|welcome|index|untitled|official site|official website|hotel|hotels|resort|book now|rooms?|about(?: us)?|contact(?: us)?|just a moment\.*|access denied|404|not found|error)$/i;

/** A hotel name that can be trusted: not a slogan, not a web address, not a generic word. */
export const cleanName = (value) => {
  let name = cleanDisplay(value).replace(/\s*[|–—•]\s*(?:official\s+(?:web)?site|home|welcome|book\s+now).*$/i, '').replace(/\s{2,}/g, ' ').trim();
  name = name.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  if (name.length < 2 || name.length > 150 || GENERIC_NAME.test(name) || /^https?:\/\//i.test(name) || /^[\w-]+(?:\.[\w-]+)+$/.test(name)) return '';
  if (/\b(?:best|top|cheap|book|deals?|offers?)\b.*\b(?:hotels?|stays?)\b.*\b(?:in|near)\b/i.test(name) && name.length > 40) return '';
  return name;
};

export { countryName };

const mapStars = (n) => (n >= 2 && n <= 5 ? `${n} star` : 'Unrated');

export const starLabel = (stars, propertyType) => {
  if (Number.isInteger(stars) && stars >= 1 && stars <= 5) return mapStars(stars);
  if (STAR_RATINGS.includes(propertyType)) return propertyType;
  return 'Unrated';
};

const PORTALS = /(?:^|\.)(?:booking\.com|tripadvisor\.[a-z.]+|agoda\.com|expedia\.[a-z.]+|makemytrip\.com|goibibo\.com|airbnb\.[a-z.]+|trivago\.[a-z.]+|hotels\.com|kayak\.[a-z.]+|cleartrip\.com|yatra\.com|ixigo\.com|oyorooms\.com|oyo\.com|lonelyplanet\.com|facebook\.com|instagram\.com|google\.[a-z.]+|trip\.com|despegar\.[a-z.]+|hostelworld\.com|vrbo\.com|zomato\.com)$/i;
export const isPortal = (host) => PORTALS.test(String(host || '').toLowerCase().replace(/^www\./, ''));

const WEBMAIL = /(?:^|\.)(?:gmail\.com|yahoo\.[a-z.]+|hotmail\.com|outlook\.com|rediffmail\.com|live\.com|icloud\.com|aol\.com)$/i;

const stripLeadingName = (text, name) => {
  const t = String(text || '');
  if (!name) return t;
  const lower = t.toLowerCase();
  const n = name.toLowerCase();
  if (lower.startsWith(`${n},`) || lower.startsWith(`${n} -`) || lower.startsWith(`${n} –`)) return t.slice(name.length).replace(/^[\s,–-]+/, '');
  return t;
};

// ---- the merge ----

/**
 * @param {object} input
 * @param {{ field: string, value: any, source: string, confidence: number, page: string }[]} input.candidates
 * @param {Map<string,string>} [input.pageKinds] page address -> 'start' | 'contact' | other, to weigh pages
 * @param {string} input.site   host of the hotel's site (for e-mail and website decisions)
 * @param {string} input.startUrl
 * @param {(url: string) => boolean} [input.publicUrl]  true when an address may be shown and fetched (pictures and links)
 */
export const mergeCandidates = ({ candidates, pageKinds = new Map(), site = '', startUrl = '', publicUrl = () => true }) => {
  const by = (field) => candidates.filter((c) => c.field === field);
  const fieldInfo = {};
  const hotel = {};

  // name
  const names = rank(by('name').map((c) => ({ ...c, value: cleanName(c.value) })).filter((c) => c.value), keyText, pageKinds);
  // a shorter name that is part of a longer one (the same hotel, with its city added) supports the shorter one
  for (const a of names) {
    for (const b of names) {
      if (a !== b && a.key.length >= 4 && b.key.includes(a.key) && b.key !== a.key) a.confidence = round3(Math.min(0.99, noisyOr([a.confidence, b.confidence * 0.5])));
    }
  }
  names.sort((x, y) => y.confidence - x.confidence || x.value.length - y.value.length);
  hotel.name = names[0]?.value || '';
  fieldInfo.name = info(names[0]);

  // kind of property and stars
  const types = rank(by('propertyType'), keyText, pageKinds);
  hotel.propertyType = types[0]?.value || '';
  const stars = rank(by('starRating'), String, pageKinds);
  hotel.starRating = starLabel(stars[0]?.value, hotel.propertyType);
  hotel.stars = stars[0] ? stars[0].value : 0;
  fieldInfo.starRating = stars[0] ? info(stars[0]) : hotel.starRating !== 'Unrated' ? info(types[0]) : null;

  // text
  const descriptions = rank(by('description').map((c) => ({ ...c, value: cleanDisplay(c.value).slice(0, 1500) })).filter((c) => c.value.length >= 20), keyText, pageKinds);
  hotel.description = descriptions[0]?.value || '';
  fieldInfo.description = info(descriptions[0]);
  const taglines = rank(by('tagline').map((c) => ({ ...c, value: cleanDisplay(c.value).slice(0, 160) })).filter((c) => c.value.length >= 4), keyText, pageKinds);
  hotel.tagline = taglines[0]?.value || '';

  // address
  const part = (name) => rank(by(`address.${name}`).map((c) => ({ ...c, value: name === 'country' ? countryName(c.value) : cleanDisplay(c.value) })).filter((c) => c.value && c.value.length <= 200), keyText, pageKinds);
  const full = rank(by('address.full').map((c) => ({ ...c, value: stripLeadingName(cleanDisplay(c.value), hotel.name) })).filter((c) => c.value.length >= 8 && c.value.length <= 300), keyText, pageKinds);
  const address = { full: full[0]?.value || '', street: '', locality: '', region: '', postalCode: '', country: '' };
  const fullInfo = full[0] ? info(full[0]) : null;
  const addressInfo = {};
  for (const key of ['street', 'locality', 'region', 'postalCode', 'country']) {
    const ranked = part(key);
    if (ranked[0]) {
      address[key] = key === 'street' ? stripLeadingName(ranked[0].value, hotel.name) : ranked[0].value;
      addressInfo[key] = info(ranked[0]);
    }
  }
  if (address.full) {
    // parts that were never stated are taken from the full address when it splits cleanly
    const split = addressParts(address.full);
    for (const key of ['street', 'locality', 'region', 'postalCode', 'country']) {
      if (!address[key] && split[key]) {
        address[key] = split[key];
        addressInfo[key] = fullInfo ? { ...fullInfo, confidence: round3(fullInfo.confidence * 0.7), level: levelOf(fullInfo.confidence * 0.7) } : null;
      }
    }
  } else {
    address.full = [address.street, address.locality, address.region, address.postalCode, address.country].filter(Boolean).join(', ');
  }
  hotel.address = address;
  fieldInfo.address = fullInfo || info(rank([...by('address.locality'), ...by('address.street')].map((c) => ({ ...c, value: cleanDisplay(c.value) })), keyText, pageKinds)[0]);
  fieldInfo.addressParts = addressInfo;

  const geos = rank(by('geo').filter((c) => Number.isFinite(c.value?.lat) && Number.isFinite(c.value?.lng)), (g) => `${g.lat.toFixed(3)},${g.lng.toFixed(3)}`, pageKinds);
  hotel.geo = geos[0] ? { lat: geos[0].value.lat, lng: geos[0].value.lng } : null;
  fieldInfo.geo = info(geos[0]);

  // times
  for (const field of ['checkIn', 'checkOut']) {
    const ranked = rank(by(field), String, pageKinds);
    hotel[field] = ranked[0]?.value || '';
    fieldInfo[field] = info(ranked[0]);
  }
  const roomCount = rank(by('roomCount'), String, pageKinds)[0];
  hotel.roomCount = roomCount ? roomCount.value : 0;

  // phones and e-mails
  const phones = rank(by('phone').map((c) => ({ ...c, value: c.value })), (p) => p.key, pageKinds)
    .filter((g) => g.confidence >= 0.4)
    .slice(0, 4);
  // the way of writing a number that has spaces or dashes is the way a person wrote it; digits run together came from a link
  const writtenBy = (key) => by('phone').filter((c) => c.value.key === key).map((c) => c.value).sort((a, b) => (b.display.match(/[\s()-]/g) || []).length - (a.display.match(/[\s()-]/g) || []).length)[0];
  hotel.phones = phones.map((g) => ({ display: formatPhone(writtenBy(g.key).display, writtenBy(g.key).digits), note: by('phone').find((c) => c.value.key === g.key && c.note)?.note || '', level: levelOf(g.confidence) }));
  fieldInfo.phones = phones.map(info);
  const siteHost = siteOf(site);
  const emails = rank(by('email'), String, pageKinds)
    .map((g) => {
      const domain = g.value.split('@')[1] || '';
      const own = siteHost && (domain === siteHost || domain.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${domain}`) || siteHost.split('.').slice(-2).join('.') === domain.split('.').slice(-2).join('.'));
      const adjust = own ? 0.1 : WEBMAIL.test(domain) ? 0 : -0.15;
      const confidence = round3(Math.max(0, Math.min(0.99, g.confidence + adjust)));
      return { ...g, confidence };
    })
    .filter((g) => g.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
  hotel.emails = emails.map((g) => g.value);
  fieldInfo.emails = emails.map(info);

  // website and social pages
  hotel.website = '';
  if (site && !isPortal(site)) {
    try {
      hotel.website = new URL(startUrl).origin;
    } catch { /* no website */ }
  } else {
    const declared = rank(by('website').filter((c) => !isPortal(siteOf(c.value))), String, pageKinds)[0];
    if (declared) hotel.website = declared.value.replace(/\/$/, '');
  }
  const social = new Map();
  for (const c of by('social')) {
    const network = c.value.network || (() => {
      try { return siteOf(c.value.url).split('.')[0]; } catch { return 'link'; }
    })();
    const current = social.get(network);
    if (!current || c.confidence > current.confidence) social.set(network, { network, url: c.value.url, confidence: c.confidence });
  }
  hotel.social = [...social.values()].filter((s) => publicUrl(s.url)).map(({ network, url }) => ({ network, url }));

  // lists
  const listOf = (field, limit, canonical = (v) => v) => rank(by(field).map((c) => ({ ...c, value: canonical(cleanDisplay(c.value)) })).filter((c) => c.value && c.value.length >= 2 && c.value.length <= 80), keyText, pageKinds).filter((g) => g.confidence >= 0.4).slice(0, limit);
  const amenities = listOf('amenity', 40);
  hotel.amenities = amenities.map((g) => g.value);
  fieldInfo.amenities = amenities.length ? { confidence: round3(amenities.reduce((s, g) => s + g.confidence, 0) / amenities.length), level: levelOf(amenities[0].confidence), count: amenities.length } : null;

  const rooms = rank(by('room').map((c) => ({ ...c, value: { name: cleanDisplay(c.value.name), details: cleanDisplay(c.value.details).slice(0, 200) } })).filter((c) => c.value.name), (r) => keyText(r.name), pageKinds)
    .map((g) => {
      const best = by('room').filter((c) => keyText(c.value.name) === g.key).map((c) => cleanDisplay(c.value.details)).sort((a, b) => b.length - a.length)[0] || '';
      return { ...g, value: { name: g.value.name, details: best.slice(0, 200) } };
    })
    .filter((g) => g.confidence >= 0.4)
    .slice(0, 20);
  hotel.rooms = rooms.map((g) => g.value);
  fieldInfo.rooms = rooms.length ? { confidence: round3(rooms[0].confidence), level: levelOf(rooms[0].confidence), count: rooms.length } : null;

  // rates: only what the hotel's own pages print
  const priced = by('price').filter((c) => c.value && c.value.from >= 1);
  const nights = priced.filter((c) => c.value.unit === 'night');
  const pool = nights.length ? nights : priced;
  if (pool.length) {
    const sorted = [...pool].sort((a, b) => b.confidence - a.confidence);
    const currency = sorted[0].value.currency || pool.find((c) => c.value.currency)?.value.currency || '';
    const same = pool.filter((c) => !c.value.currency || c.value.currency === currency);
    const lowest = same.reduce((m, c) => (c.value.from < m.value.from ? c : m), same[0]);
    hotel.rates = {
      currency,
      from: Math.min(...same.map((c) => c.value.from)),
      to: Math.max(...same.map((c) => Math.max(c.value.from, c.value.to || 0))),
      unit: pool === nights ? 'night' : sorted[0].value.unit,
      text: cleanDisplay(lowest.value.text || ''),
      lines: same.filter((c) => c.value.text).slice(0, 6).map((c) => ({ text: cleanDisplay(c.value.text), from: c.value.from, to: Math.max(c.value.from, c.value.to || 0), unit: c.value.unit })),
      note: "As printed on the hotel's own website. Check it with the hotel before quoting."
    };
    fieldInfo.rates = info(rank(pool.map((c) => ({ ...c, value: c.value.from })), String, pageKinds)[0]);
  } else {
    hotel.rates = null;
    fieldInfo.rates = null;
  }
  const level = rank(by('priceLevel'), String, pageKinds)[0];
  hotel.priceLevel = level ? level.value : 0;

  const ratings = rank(by('rating').filter((c) => c.value.value > 0 && c.value.value <= c.value.best), (r) => `${r.value}/${r.best}`, pageKinds);
  hotel.guestRating = ratings[0] ? { value: ratings[0].value.value, best: ratings[0].value.best, count: ratings[0].value.count || 0 } : null;
  fieldInfo.guestRating = info(ratings[0]);

  // policies
  hotel.policies = {};
  for (const [key, field] of [['cancellation', 'policy.cancellation'], ['children', 'policy.children'], ['pets', 'policy.pets']]) {
    const ranked = rank(by(field).map((c) => ({ ...c, value: cleanDisplay(c.value).slice(0, 600) })).filter((c) => c.value.length >= 15), keyText, pageKinds)[0];
    if (ranked) hotel.policies[key] = ranked.value;
  }
  if (!hotel.policies.pets) {
    const petsNo = by('petsPolicy')[0];
    if (petsNo) hotel.policies.pets = cleanDisplay(petsNo.value);
  }

  // pictures: addresses only, public ones only, the most likely hotel photos first
  const seen = new Set();
  const images = [];
  for (const c of [...by('image')].sort((a, b) => b.confidence - a.confidence)) {
    const url = c.value.url;
    if (seen.has(url) || !publicUrl(url)) continue;
    seen.add(url);
    images.push({ url, alt: cleanDisplay(c.value.alt).slice(0, 160), width: c.value.width || 0, height: c.value.height || 0, role: c.value.role || 'page', confidence: round3(c.confidence) });
    if (images.length >= 24) break;
  }
  hotel.images = images;
  hotel.logo = by('logo').sort((a, b) => b.confidence - a.confidence).map((c) => c.value).find((u) => publicUrl(u)) || '';

  return { hotel, fieldInfo };
};

// ---- completeness ----

const WEIGHTS = [
  ['name', 15, (h) => !!h.name],
  ['address', 15, (h) => (h.address.locality && h.address.country ? 15 : h.address.full ? 9 : h.address.locality ? 6 : 0)],
  ['phone', 10, (h) => h.phones.length > 0],
  ['email', 8, (h) => h.emails.length > 0],
  ['description', 10, (h) => !!h.description],
  ['star rating', 5, (h) => h.starRating !== 'Unrated'],
  ['rooms', 8, (h) => h.rooms.length > 0],
  ['amenities', 8, (h) => h.amenities.length > 0],
  ['rates', 6, (h) => !!h.rates],
  ['pictures', 8, (h) => h.images.length >= 3 ? true : h.images.length > 0 ? 0.5 : false],
  ['check-in and check-out', 4, (h) => (h.checkIn && h.checkOut ? true : h.checkIn || h.checkOut ? 0.5 : false)],
  ['map position', 3, (h) => !!h.geo]
];

/** How complete the find is (0-100), and what was found and what is missing, in words a person can read. */
export const completeness = (hotel) => {
  let score = 0;
  const found = [];
  const missing = [];
  for (const [label, weight, test] of WEIGHTS) {
    const got = test(hotel);
    const points = got === true ? weight : typeof got === 'number' ? (got > 1 ? got : weight * got) : 0;
    score += points;
    if (points >= weight * 0.99) found.push(label);
    else if (points > 0) found.push(`${label} (partly)`);
    else missing.push(label);
  }
  return { score: Math.round(score), found, missing };
};

/** Does this look like the website of a place to stay? (judged from what was found, and the words on the pages) */
export const hotelLikeness = ({ hotel, propertyTypeFound, words = '' }) => {
  let points = 0;
  if (propertyTypeFound) points += 3;
  if (hotel.rooms.length) points += 2;
  if (hotel.checkIn || hotel.checkOut) points += 2;
  if (hotel.starRating !== 'Unrated') points += 1;
  if (hotel.amenities.length >= 3) points += 1;
  if (/\b(?:hotel|resort|homestay|guest\s?house|villa|lodge|inn|suites?|rooms?|accommodation|stay)\b/i.test(words)) points += 1;
  if (/\bcheck[\s-]?(?:in|out)\b/i.test(words)) points += 1;
  return points;
};
