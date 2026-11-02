import { line, normalizePhotos } from './itineraryInput.js';
import { sanitizeRich } from './richText.js';
import { normalizeQuotationPriceTables } from './quotationPriceTables.js';

// Turns what the browser sent for a hotel into what may be stored, or says in plain language what is wrong.
// Pure logic (no database), so it can be tested exhaustively. Photos are only checked for shape here; the controller
// confirms they exist and fills in their true size.

export const HOTEL_LIMITS = {
  name: 150,
  city: 100,
  country: 80,
  area: 100,
  address: 300,
  description: 5000,
  contactPerson: 100,
  phone: 40,
  email: 120,
  website: 200,
  amenities: 40,
  amenityLength: 40,
  roomTypes: 30,
  roomName: 80,
  roomDetails: 200,
  policy: 1500,
  notes: 1500,
  tags: 10,
  tagLength: 30,
  photos: 30
};

export const STAR_RATINGS = ['5 star', '4 star', '3 star', '2 star', 'Heritage / Palace', 'Resort / Villa', 'Unrated'];
export const MEAL_PLAN_OPTIONS = ['CP (Breakfast Only)', 'MAP (Breakfast & Dinner)', 'AP (All Meals)', 'EP (Room Only)'];
export const HOTEL_STATUSES = ['Active', 'Archived'];

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sentence = (text) => `${text[0].toUpperCase()}${text.slice(1)}`;

/** "name|city" in lower case with single spaces: what makes two hotels "the same". */
export const nameKeyOf = (name, city) => {
  const clean = (v) => String(v ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  return `${clean(name)}|${clean(city)}`;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-().\s]{5,40}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const normalizeWebsite = (raw) => {
  if (!raw) return { ok: true, value: '' };
  const text = String(raw).trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error('not a web address');
    return { ok: true, value: url.toString().replace(/\/$/, '') };
  } catch {
    return fail('The website address does not look right. Example: https://www.example.com');
  }
};

/** A list of short unique texts (amenities, tags): trimmed, blanks dropped, repeats ignoring case dropped. */
const wordList = (value, { label, one, max, maxLength, lower = false }) => {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail(`${sentence(label)} must be a list.`);
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = line(raw, one, maxLength);
    if (!item.ok) return item;
    const text = lower ? item.value.toLowerCase() : item.value;
    if (text && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      out.push(text);
    }
  }
  if (out.length > max) return fail(`A hotel can have at most ${max} ${label} (there are ${out.length}).`);
  return { ok: true, value: out };
};

const normalizeRoomTypes = (value) => {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail('The room types must be a list.');
  if (value.length > HOTEL_LIMITS.roomTypes) return fail(`A hotel can have at most ${HOTEL_LIMITS.roomTypes} room types (there are ${value.length}).`);
  const out = [];
  const seen = new Set();
  for (const [index, raw] of value.entries()) {
    const n = index + 1;
    if (!isPlainObject(raw)) return fail(`Room type ${n} is not valid.`);
    const name = line(raw.name, `a name for room type ${n}`, HOTEL_LIMITS.roomName, { required: true });
    if (!name.ok) return name;
    const details = line(raw.details, `the details of room type ${n}`, HOTEL_LIMITS.roomDetails);
    if (!details.ok) return details;
    if (seen.has(name.value.toLowerCase())) return fail(`The room type "${name.value}" is listed twice. Please keep it once.`);
    seen.add(name.value.toLowerCase());
    out.push({ name: name.value, details: details.value });
  }
  return { ok: true, value: out };
};

/**
 * @param {object} body what the client sent
 * @param {{ partial?: boolean }} options partial = an update: only the fields that are present are checked and returned
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export const normalizeHotelInput = (body, { partial = false } = {}) => {
  if (!isPlainObject(body)) return fail('The hotel could not be read. Please reload the page and try again.');
  const L = HOTEL_LIMITS;
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
  const wanted = (key) => !partial || has(key);

  const texts = [
    ['name', 'the name of the hotel', L.name, true],
    ['city', 'the city', L.city, true],
    ['country', 'the country', L.country, false],
    ['area', 'the area', L.area, false],
    ['address', 'the address', L.address, false],
    ['contactPerson', 'the contact person', L.contactPerson, false]
  ];
  for (const [key, label, max, required] of texts) {
    if (!wanted(key)) continue;
    const r = line(body[key], label, max, { required });
    if (!r.ok) return r;
    data[key] = r.value;
  }

  if (wanted('starRating')) {
    const value = body.starRating === undefined || body.starRating === null || body.starRating === '' ? 'Unrated' : body.starRating;
    if (!STAR_RATINGS.includes(value)) return fail(`Please choose the rating from the list: ${STAR_RATINGS.join(', ')}.`);
    data.starRating = value;
  }

  if (wanted('phone')) {
    const r = line(body.phone, 'the phone number', L.phone);
    if (!r.ok) return r;
    if (r.value && !PHONE.test(r.value)) return fail('The phone number may only contain digits, spaces and + - ( ) . characters (5 to 40 of them).');
    data.phone = r.value;
  }
  if (wanted('email')) {
    const r = line(body.email, 'the email address', L.email);
    if (!r.ok) return r;
    if (r.value && !EMAIL.test(r.value)) return fail('The email address does not look right. Please check it.');
    data.email = r.value.toLowerCase();
  }
  if (wanted('website')) {
    const r = line(body.website, 'the website address', L.website);
    if (!r.ok) return r;
    const site = normalizeWebsite(r.value);
    if (!site.ok) return site;
    data.website = site.value;
  }

  for (const [key, label, fallback] of [['checkInTime', 'check-in time', '14:00'], ['checkOutTime', 'check-out time', '11:00']]) {
    if (!wanted(key)) continue;
    const value = body[key] === undefined || body[key] === null || body[key] === '' ? fallback : body[key];
    if (typeof value !== 'string' || !TIME.test(value)) return fail(`The ${label} must be a time like 14:00.`);
    data[key] = value;
  }

  // The pricing tables: only when sent (a hotel saved without them simply has none yet).
  if (has('priceTables')) {
    const r = normalizeQuotationPriceTables(body.priceTables);
    if (!r.ok) return r;
    data.priceTables = r.value;
  }

  if (wanted('description')) {
    const r = sanitizeRich(body.description, { label: 'The description', maxText: L.description });
    if (!r.ok) return r;
    data.description = r.value;
  }
  for (const [key, label, max] of [['cancellationPolicy', 'The cancellation policy', L.policy], ['notes', 'The internal notes', L.notes]]) {
    if (!wanted(key)) continue;
    const r = sanitizeRich(body[key], { label, maxText: max });
    if (!r.ok) return r;
    data[key] = r.value;
  }

  if (wanted('photos')) {
    const r = normalizePhotos(body.photos, 'The photo gallery', L.photos);
    if (!r.ok) return r;
    data.photos = r.value;
  }
  if (wanted('amenities')) {
    const r = wordList(body.amenities, { label: 'amenities', one: 'an amenity', max: L.amenities, maxLength: L.amenityLength });
    if (!r.ok) return r;
    data.amenities = r.value;
  }
  if (wanted('roomTypes')) {
    const r = normalizeRoomTypes(body.roomTypes);
    if (!r.ok) return r;
    data.roomTypes = r.value;
  }
  if (wanted('mealPlans')) {
    const plans = body.mealPlans ?? [];
    if (!Array.isArray(plans) || plans.some((p) => !MEAL_PLAN_OPTIONS.includes(p))) return fail(`The meal plans must be chosen from: ${MEAL_PLAN_OPTIONS.join(', ')}.`);
    data.mealPlans = MEAL_PLAN_OPTIONS.filter((p) => plans.includes(p)); // in the standard order, each once
  }
  if (wanted('tags')) {
    const r = wordList(body.tags, { label: 'tags', one: 'a tag', max: L.tags, maxLength: L.tagLength, lower: true });
    if (!r.ok) return r;
    data.tags = r.value;
  }

  if (has('status')) {
    if (!HOTEL_STATUSES.includes(body.status)) return fail(`Status must be one of: ${HOTEL_STATUSES.join(', ')}.`);
    data.status = body.status;
  }

  return { ok: true, data };
};

/** Every photo token an input mentions (to check they exist). */
export const hotelPhotoTokens = (data) => (data.photos || []).map((p) => p.token);
