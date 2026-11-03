import { line, normalizePhotos } from './itineraryInput.js';
import { STAR_RATINGS, nameKeyOf } from './hotelInput.js';

// Turns what the browser sent for a found hotel into what may be stored, or says in plain words what is wrong. Pure logic (no database).
// Only the name is required: a find is often incomplete, and the person completes it when it is added to the hotel list.

export const FOUND_LIMITS = {
  name: 150, propertyType: 40, tagline: 160, description: 5000, addressLine: 300, addressPart: 120, phones: 8, phone: 40, emails: 8, email: 120, website: 200, social: 10, socialNetwork: 20, url: 2048,
  amenities: 60, amenity: 80, rooms: 30, roomName: 80, roomDetails: 200, policy: 700, notes: 1500, tags: 10, tag: 30, photos: 30, warnings: 12, warning: 400, pages: 12, label: 60, rateLines: 6, rateText: 200, currency: 5, maxAmount: 100_000_000
};

export const FOUND_SOURCES = ['website', 'pasted', 'manual'];

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-().\s]{5,40}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const LEVELS = ['high', 'medium', 'low'];

const webUrl = (value, label, max = FOUND_LIMITS.url) => {
  const r = line(value, label, max);
  if (!r.ok) return r;
  if (!r.value) return r;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(r.value) ? r.value : `https://${r.value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error('x');
    return { ok: true, value: url.toString().replace(/\/$/, '') };
  } catch {
    return fail(`${label[0].toUpperCase()}${label.slice(1)} does not look like a web address. Example: https://www.example-hotel.com`);
  }
};

/** Plain text of several lines (a description): control characters out, line breaks kept (at most two in a row), trimmed. */
const longText = (value, label, max) => {
  if (value === undefined || value === null) return { ok: true, value: '' };
  if (typeof value !== 'string') return fail(`${label[0].toUpperCase()}${label.slice(1)} must be text.`);
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length > max) return fail(`${label[0].toUpperCase()}${label.slice(1)} is too long (${clean.length} characters; the limit is ${max}).`);
  return { ok: true, value: clean };
};

const stringList = (value, { label, one, max, maxLength, test, bad, lower = false }) => {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail(`${label[0].toUpperCase()}${label.slice(1)} must be a list.`);
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = line(raw, one, maxLength);
    if (!item.ok) return item;
    if (!item.value) continue;
    if (test && !test(item.value)) return fail(bad(item.value));
    const text = lower ? item.value.toLowerCase() : item.value;
    if (!seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      out.push(text);
    }
  }
  if (out.length > max) return fail(`There can be at most ${max} ${label} (there are ${out.length}).`);
  return { ok: true, value: out };
};

const amount = (value, label) => {
  if (value === undefined || value === null || value === '') return { ok: true, value: 0 };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > FOUND_LIMITS.maxAmount) return fail(`${label[0].toUpperCase()}${label.slice(1)} must be an amount from 0 to ${FOUND_LIMITS.maxAmount.toLocaleString('en-IN')}.`);
  return { ok: true, value: Math.round(n * 100) / 100 };
};

const normalizeRates = (value) => {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!isPlainObject(value)) return fail('The rates are not valid.');
  const from = amount(value.from, 'the lowest rate');
  if (!from.ok) return from;
  if (!from.value) return { ok: true, value: null };
  const to = amount(value.to, 'the highest rate');
  if (!to.ok) return to;
  const currency = line(value.currency, 'the currency', FOUND_LIMITS.currency);
  if (!currency.ok) return currency;
  const unit = value.unit === 'person' ? 'person' : 'night';
  const text = line(value.text, 'the rate text', FOUND_LIMITS.rateText);
  if (!text.ok) return text;
  const note = line(value.note, 'the rate note', FOUND_LIMITS.rateText);
  if (!note.ok) return note;
  const lines = [];
  for (const raw of Array.isArray(value.lines) ? value.lines.slice(0, FOUND_LIMITS.rateLines) : []) {
    if (!isPlainObject(raw)) continue;
    const t = line(raw.text, 'a rate line', FOUND_LIMITS.rateText);
    const f = amount(raw.from, 'a rate');
    if (!t.ok || !f.ok || !f.value) continue;
    const hi = amount(raw.to, 'a rate');
    lines.push({ text: t.value, from: f.value, to: hi.ok && hi.value >= f.value ? hi.value : f.value, unit: raw.unit === 'person' ? 'person' : 'night' });
  }
  return { ok: true, value: { currency: currency.value.toUpperCase(), from: from.value, to: Math.max(from.value, to.value), unit, text: text.value, note: note.value, lines } };
};

/**
 * @param {object} body what the client sent
 * @param {{ partial?: boolean }} options partial = an update: only the fields that are present are checked and returned
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export const normalizeFoundInput = (body, { partial = false } = {}) => {
  if (!isPlainObject(body)) return fail('The hotel could not be read. Please reload the page and try again.');
  const L = FOUND_LIMITS;
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
  const wanted = (key) => !partial || has(key);

  for (const [key, label, max, required] of [['name', 'the name of the hotel', L.name, true], ['propertyType', 'the kind of property', L.propertyType, false], ['tagline', 'the tagline', L.tagline, false], ['website', 'the website address', L.website, false]]) {
    if (!wanted(key)) continue;
    if (key === 'website') {
      const r = webUrl(body.website, label, L.website);
      if (!r.ok) return r;
      data.website = r.value;
      continue;
    }
    const r = line(body[key], label, max, { required });
    if (!r.ok) return r;
    data[key] = r.value;
  }
  if (wanted('starRating')) {
    const value = body.starRating === undefined || body.starRating === null || body.starRating === '' ? 'Unrated' : body.starRating;
    if (!STAR_RATINGS.includes(value)) return fail(`Please choose the rating from the list: ${STAR_RATINGS.join(', ')}.`);
    data.starRating = value;
  }
  if (wanted('description')) {
    const r = longText(body.description, 'the description', L.description);
    if (!r.ok) return r;
    data.description = r.value;
  }

  if (wanted('address')) {
    const a = body.address === undefined || body.address === null ? {} : body.address;
    if (!isPlainObject(a)) return fail('The address is not valid.');
    const address = {};
    for (const [key, label, max] of [['full', 'the address', L.addressLine], ['street', 'the street', L.addressPart], ['locality', 'the city', L.addressPart], ['region', 'the state or region', L.addressPart], ['postalCode', 'the postal code', 20], ['country', 'the country', L.addressPart]]) {
      const r = line(a[key], label, max);
      if (!r.ok) return r;
      address[key] = r.value;
    }
    data.address = address;
  }
  if (wanted('geo')) {
    const g = body.geo;
    if (g === undefined || g === null || g === '') data.geo = null;
    else {
      const lat = Number(g?.lat);
      const lng = Number(g?.lng);
      if (!isPlainObject(g) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail('The map position must be a latitude (-90 to 90) and a longitude (-180 to 180).');
      data.geo = { lat, lng };
    }
  }
  if (wanted('phones')) {
    const r = stringList(body.phones, { label: 'phone numbers', one: 'a phone number', max: L.phones, maxLength: L.phone, test: (v) => PHONE.test(v), bad: (v) => `The phone number "${v}" may only contain digits, spaces and + - ( ) . characters (5 to 40 of them).` });
    if (!r.ok) return r;
    data.phones = r.value;
  }
  if (wanted('emails')) {
    const r = stringList(body.emails, { label: 'email addresses', one: 'an email address', max: L.emails, maxLength: L.email, lower: true, test: (v) => EMAIL.test(v), bad: (v) => `The email address "${v}" does not look right.` });
    if (!r.ok) return r;
    data.emails = r.value;
  }
  if (wanted('social')) {
    const list = body.social ?? [];
    if (!Array.isArray(list)) return fail('The social pages must be a list.');
    const out = [];
    for (const item of list.slice(0, L.social)) {
      if (!isPlainObject(item)) continue;
      const network = line(item.network, 'the name of a social page', L.socialNetwork);
      const url = webUrl(item.url, 'the address of a social page');
      if (!network.ok) return network;
      if (!url.ok) return url;
      if (url.value) out.push({ network: network.value.toLowerCase(), url: url.value });
    }
    data.social = out;
  }
  for (const [key, label] of [['checkIn', 'check-in time'], ['checkOut', 'check-out time']]) {
    if (!wanted(key)) continue;
    const value = body[key] === undefined || body[key] === null ? '' : body[key];
    if (value !== '' && (typeof value !== 'string' || !TIME.test(value))) return fail(`The ${label} must be a time like 14:00.`);
    data[key] = value;
  }
  if (wanted('amenities')) {
    const r = stringList(body.amenities, { label: 'amenities', one: 'an amenity', max: L.amenities, maxLength: L.amenity });
    if (!r.ok) return r;
    data.amenities = r.value;
  }
  if (wanted('rooms')) {
    const list = body.rooms ?? [];
    if (!Array.isArray(list)) return fail('The rooms must be a list.');
    if (list.length > L.rooms) return fail(`There can be at most ${L.rooms} room types (there are ${list.length}).`);
    const out = [];
    const seen = new Set();
    for (const [index, raw] of list.entries()) {
      if (!isPlainObject(raw)) return fail(`Room type ${index + 1} is not valid.`);
      const name = line(raw.name, `a name for room type ${index + 1}`, L.roomName, { required: true });
      if (!name.ok) return name;
      const details = line(raw.details, `the details of room type ${index + 1}`, L.roomDetails);
      if (!details.ok) return details;
      if (seen.has(name.value.toLowerCase())) return fail(`The room type "${name.value}" is listed twice. Please keep it once.`);
      seen.add(name.value.toLowerCase());
      out.push({ name: name.value, details: details.value });
    }
    data.rooms = out;
  }
  if (wanted('rates')) {
    const r = normalizeRates(body.rates);
    if (!r.ok) return r;
    data.rates = r.value;
  }
  if (wanted('priceLevel')) {
    const n = Number(body.priceLevel ?? 0);
    data.priceLevel = Number.isInteger(n) && n >= 0 && n <= 4 ? n : 0;
  }
  if (wanted('guestRating')) {
    const g = body.guestRating;
    if (g === undefined || g === null) data.guestRating = null;
    else {
      const value = Number(g?.value);
      const best = Number(g?.best);
      const count = Number(g?.count ?? 0);
      if (!isPlainObject(g) || !Number.isFinite(value) || !Number.isFinite(best) || value <= 0 || best <= 0 || value > best || best > 100) return fail('The guest rating must be a score above 0 that is not more than the best possible score.');
      data.guestRating = { value, best, count: Number.isInteger(count) && count >= 0 && count < 100_000_000 ? count : 0 };
    }
  }
  if (wanted('policies')) {
    const p = body.policies === undefined || body.policies === null ? {} : body.policies;
    if (!isPlainObject(p)) return fail('The policies are not valid.');
    const policies = {};
    for (const [key, label] of [['cancellation', 'the cancellation policy'], ['children', 'the children policy'], ['pets', 'the pets policy']]) {
      const r = longText(p[key], label, L.policy);
      if (!r.ok) return r;
      policies[key] = r.value;
    }
    data.policies = policies;
  }
  if (wanted('photos')) {
    const r = normalizePhotos(body.photos, 'The photo gallery', L.photos);
    if (!r.ok) return r;
    data.photos = r.value;
  }
  if (wanted('notes')) {
    const r = longText(body.notes, 'the internal notes', L.notes);
    if (!r.ok) return r;
    data.notes = r.value;
  }
  if (wanted('tags')) {
    const r = stringList(body.tags, { label: 'tags', one: 'a tag', max: L.tags, maxLength: L.tag, lower: true });
    if (!r.ok) return r;
    data.tags = r.value;
  }

  // Where it came from and how sure the finder was: kept as given (clamped), they are information, not rules.
  if (wanted('sourceUrl')) {
    const r = webUrl(body.sourceUrl, 'the address it was found at');
    if (!r.ok) return r;
    data.sourceUrl = r.value;
    try {
      data.sourceSite = r.value ? new URL(r.value).hostname.replace(/^www\./, '').slice(0, 253) : '';
    } catch {
      data.sourceSite = '';
    }
  }
  if (wanted('source')) {
    const value = body.source === undefined || body.source === null || body.source === '' ? 'manual' : body.source;
    if (!FOUND_SOURCES.includes(value)) return fail(`Where the details came from must be one of: ${FOUND_SOURCES.join(', ')}.`);
    data.source = value;
  }
  if (wanted('completeness')) {
    const c = body.completeness;
    if (c === undefined || c === null) data.completeness = null;
    else if (isPlainObject(c)) {
      const words = (list) => (Array.isArray(list) ? list.filter((w) => typeof w === 'string').map((w) => w.slice(0, 60)).slice(0, 20) : []);
      const score = Number(c.score);
      data.completeness = { score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0, found: words(c.found), missing: words(c.missing) };
    } else return fail('The completeness information is not valid.');
  }
  if (wanted('warnings')) {
    data.warnings = (Array.isArray(body.warnings) ? body.warnings : []).filter((w) => typeof w === 'string').map((w) => w.replace(/<[^>]*>/g, '').trim().slice(0, L.warning)).filter(Boolean).slice(0, L.warnings);
  }
  if (wanted('pagesRead')) {
    const out = [];
    for (const p of (Array.isArray(body.pagesRead) ? body.pagesRead : []).slice(0, L.pages)) {
      if (!isPlainObject(p)) continue;
      const url = webUrl(p.url, 'a page address');
      const label = line(p.label, 'a page label', L.label);
      if (url.ok && label.ok && url.value) out.push({ url: url.value, label: label.value });
    }
    data.pagesRead = out;
  }
  if (wanted('fieldLevels')) {
    const levels = {};
    if (isPlainObject(body.fieldLevels)) for (const [key, value] of Object.entries(body.fieldLevels).slice(0, 40)) if (/^[a-zA-Z]{1,30}$/.test(key) && LEVELS.includes(value)) levels[key] = value;
    data.fieldLevels = levels;
  }
  if (wanted('foundAt') && has('foundAt')) {
    const d = new Date(body.foundAt);
    if (!Number.isNaN(d.getTime())) data.foundAt = d;
  }
  return { ok: true, data };
};

/** "name|city" for the duplicate check: the same hotel is not saved twice. */
export const foundNameKey = (data) => nameKeyOf(data.name, data.address?.locality || '');

export const foundPhotoTokens = (data) => (data.photos || []).map((p) => p.token);
