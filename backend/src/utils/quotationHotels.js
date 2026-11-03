import { line, normalizePhotos } from './itineraryInput.js';
import { RATE_KINDS, RATE_LABELS, RATE_LIMITS } from './hotelRates.js';

// The hotel stays of a quotation. Stays typed by hand (and what the mobile app sends today) carry none of the extra
// fields below and stay valid exactly as they were. A stay taken from the hotel list also carries a copy of the hotel's
// photos, amenities and times. Every other field is left to the database model. Pure logic, so it can be tested exhaustively;
// the controller confirms the photos exist.

export const STAY_LIMITS = { stays: 50, photos: 6, amenities: 40, amenityLength: 40, roomOptions: 30, roomLength: 80 };

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const textList = (value, label, { max, maxLength }) => {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail(`${label} must be a list.`);
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = line(raw, 'an entry', maxLength);
    if (!item.ok) return item;
    if (item.value && !seen.has(item.value.toLowerCase())) {
      seen.add(item.value.toLowerCase());
      out.push(item.value);
    }
  }
  if (out.length > max) return fail(`${label} can have at most ${max} entries (there are ${out.length}).`);
  return { ok: true, value: out };
};

const wholeNumber = (raw, max) => {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }; // not typed: it follows the stay
  const n = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isInteger(n) || n < 0 || n > max) return { ok: false };
  return { ok: true, value: n };
};

/**
 * The rate table of one stay (the client's sheet: per room per night, nights, rooms). Each row is the room, an extra bed, a child
 * with a bed or a child with no bed, once each; the nights and the rooms may be left out, and then they follow the stay.
 */
const normalizeRates = (value, n) => {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail(`The rates of hotel stay ${n} must be a list.`);
  if (value.length > RATE_LIMITS.rows) return fail(`Hotel stay ${n} can have at most ${RATE_LIMITS.rows} rate rows (there are ${value.length}).`);
  const out = [];
  const seen = new Set();
  for (const [index, raw] of value.entries()) {
    const row = `rate row ${index + 1} of hotel stay ${n}`;
    if (!isPlainObject(raw)) return fail(`The ${row} is not valid.`);
    if (!RATE_KINDS.includes(raw.kind)) return fail(`The ${row} must be the room, an extra bed, a child with a bed or a child with no bed.`);
    if (seen.has(raw.kind)) return fail(`Hotel stay ${n} has the "${RATE_LABELS[raw.kind]}" row twice. Please keep it once.`);
    seen.add(raw.kind);
    const label = line(raw.label, `the name of the ${row}`, RATE_LIMITS.label);
    if (!label.ok) return label;
    const rate = raw.rate === undefined || raw.rate === null || raw.rate === '' ? 0 : typeof raw.rate === 'number' || typeof raw.rate === 'string' ? Number(raw.rate) : Number.NaN;
    if (!Number.isFinite(rate) || rate < 0 || rate > RATE_LIMITS.maxRate) return fail(`The rate of the ${row} must be an amount from 0 to ${RATE_LIMITS.maxRate.toLocaleString('en-IN')}.`);
    const nights = wholeNumber(raw.nights, RATE_LIMITS.maxNights);
    if (!nights.ok) return fail(`The nights of the ${row} must be a whole number from 0 to ${RATE_LIMITS.maxNights}.`);
    const rooms = wholeNumber(raw.rooms, RATE_LIMITS.maxUnits);
    if (!rooms.ok) return fail(`The number of rooms of the ${row} must be a whole number from 0 to ${RATE_LIMITS.maxUnits}.`);
    out.push({ kind: raw.kind, label: label.value || RATE_LABELS[raw.kind], rate: Math.round(rate * 100) / 100, nights: nights.value, rooms: rooms.value });
  }
  return { ok: true, value: out };
};

/**
 * @param {unknown} value the `packageDetails.hotels` list a client sent
 * @returns {{ ok: true, value: object[] } | { ok: false, message: string }}
 */
export const normalizeQuotationHotels = (value) => {
  if (!Array.isArray(value)) return fail('The hotel stays must be a list.');
  if (value.length > STAY_LIMITS.stays) return fail(`A quotation can have at most ${STAY_LIMITS.stays} hotel stays (there are ${value.length}).`);
  const stays = [];
  for (const [index, raw] of value.entries()) {
    const n = index + 1;
    if (!isPlainObject(raw)) return fail(`Hotel stay ${n} is not valid.`);
    const hotelId = raw.hotelId === undefined || raw.hotelId === null || raw.hotelId === '' ? '' : raw.hotelId;
    if (hotelId !== '' && (typeof hotelId !== 'string' || !OBJECT_ID.test(hotelId))) return fail(`The hotel chosen for stay ${n} is not valid. Please choose it again from the hotel list.`);
    const photos = normalizePhotos(raw.photos, `Hotel stay ${n}`, STAY_LIMITS.photos);
    if (!photos.ok) return photos;
    const amenities = textList(raw.amenities, `The amenities of hotel stay ${n}`, { max: STAY_LIMITS.amenities, maxLength: STAY_LIMITS.amenityLength });
    if (!amenities.ok) return amenities;
    const roomOptions = textList(raw.roomOptions, `The room types of hotel stay ${n}`, { max: STAY_LIMITS.roomOptions, maxLength: STAY_LIMITS.roomLength });
    if (!roomOptions.ok) return roomOptions;
    const times = {};
    for (const [key, label] of [['checkInTime', 'check-in time'], ['checkOutTime', 'check-out time']]) {
      const time = raw[key] === undefined || raw[key] === null ? '' : raw[key];
      if (time !== '' && (typeof time !== 'string' || !TIME.test(time))) return fail(`The ${label} of hotel stay ${n} must be a time like 14:00.`);
      times[key] = time;
    }
    const rates = normalizeRates(raw.rates, n);
    if (!rates.ok) return rates;
    stays.push({ ...raw, hotelId, photos: photos.value, amenities: amenities.value, roomOptions: roomOptions.value, rates: rates.value, ...times });
  }
  return { ok: true, value: stays };
};

/** Every photo token the stays mention (to confirm they exist). */
export const stayPhotoTokens = (stays) => stays.flatMap((s) => s.photos.map((p) => p.token));
