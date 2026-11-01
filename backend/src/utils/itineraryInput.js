import { sanitizeRich, sanitizeRichList } from './richText.js';
import { TOKEN_PATTERN } from '../controllers/mediaController.js';

// Turns what the browser sent into what may be stored, or says in plain language what is wrong.
// Pure logic (no database), so it can be tested exhaustively. Photo references are only checked for shape here;
// the controller confirms the photos really exist and fills in their true size.

export const LIMITS = {
  title: 150,
  destination: 120,
  country: 80,
  maxNights: 60,
  summary: 5000,
  dayTitle: 150,
  dayDescription: 8000,
  dayMeals: 120,
  dayStay: 120,
  maxDays: 60,
  photosPerDay: 6,
  itineraryPhotos: 10,
  listItems: 60,
  listItemText: 300,
  tags: 10,
  tagLength: 30,
  caption: 120
};

export const STATUSES = ['Active', 'Archived'];

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** One line of text: trimmed, no control characters, inner line breaks and runs of spaces collapsed. */
export const line = (value, label, max, { required = false } = {}) => {
  if (value === undefined || value === null) return required ? fail(`Please enter ${label}.`) : { ok: true, value: '' };
  if (typeof value !== 'string') return fail(`${label[0].toUpperCase()}${label.slice(1)} must be text.`);
  const clean = value.replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  if (required && !clean) return fail(`Please enter ${label}.`);
  if (clean.length > max) return fail(`${label[0].toUpperCase()}${label.slice(1)} is too long (${clean.length} characters; the limit is ${max}).`);
  return { ok: true, value: clean };
};

/** A list of photo references: [{ token, caption }]. Duplicates within the list are dropped. */
export const normalizePhotos = (value, label, max) => {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail(`${label} must be a list of photos.`);
  if (value.length > max) return fail(`${label} can have at most ${max} photos (there are ${value.length}).`);
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (!isPlainObject(item) || typeof item.token !== 'string' || !TOKEN_PATTERN.test(item.token)) {
      return fail(`${label} contains a photo that is not valid. Please remove it and add it again.`);
    }
    if (seen.has(item.token)) continue;
    seen.add(item.token);
    const caption = line(item.caption, 'the photo caption', LIMITS.caption);
    if (!caption.ok) return caption;
    out.push({ token: item.token, caption: caption.value });
  }
  return { ok: true, value: out };
};

const normalizeDays = (value) => {
  if (!Array.isArray(value)) return fail('The days of the itinerary must be a list.');
  if (value.length > LIMITS.maxDays) return fail(`An itinerary can have at most ${LIMITS.maxDays} days (there are ${value.length}).`);
  const days = [];
  for (const [index, raw] of value.entries()) {
    const n = index + 1;
    if (!isPlainObject(raw)) return fail(`Day ${n} is not valid.`);
    const title = line(raw.title, `a title for Day ${n}`, LIMITS.dayTitle, { required: true });
    if (!title.ok) return title;
    const description = sanitizeRich(raw.description, { label: `The description of Day ${n}`, maxText: LIMITS.dayDescription });
    if (!description.ok) return description;
    const meals = line(raw.meals, `the meals for Day ${n}`, LIMITS.dayMeals);
    if (!meals.ok) return meals;
    const stay = line(raw.stay, `the overnight stay for Day ${n}`, LIMITS.dayStay);
    if (!stay.ok) return stay;
    const photos = normalizePhotos(raw.photos, `Day ${n}`, LIMITS.photosPerDay);
    if (!photos.ok) return photos;
    days.push({ title: title.value, description: description.value, meals: meals.value, stay: stay.value, photos: photos.value });
  }
  return { ok: true, value: days };
};

const normalizeTags = (value) => {
  if (!Array.isArray(value)) return fail('Tags must be a list.');
  const out = [];
  for (const raw of value) {
    const tag = line(raw, 'a tag', LIMITS.tagLength);
    if (!tag.ok) return tag;
    const lower = tag.value.toLowerCase();
    if (lower && !out.includes(lower)) out.push(lower);
  }
  if (out.length > LIMITS.tags) return fail(`An itinerary can have at most ${LIMITS.tags} tags.`);
  return { ok: true, value: out };
};

/**
 * @param {object} body what the client sent
 * @param {{ partial?: boolean }} options partial = an update: only the fields that are present are checked and returned
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export const normalizeItineraryInput = (body, { partial = false } = {}) => {
  if (!isPlainObject(body)) return fail('The itinerary could not be read. Please reload the page and try again.');
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;

  const simple = [
    ['title', 'a title for the itinerary', LIMITS.title, true],
    ['destination', 'the destination', LIMITS.destination, true],
    ['country', 'the country', LIMITS.country, false]
  ];
  for (const [key, label, max, required] of simple) {
    if (!partial || has(key)) {
      const r = line(body[key], label, max, { required });
      if (!r.ok) return r;
      data[key] = r.value;
    }
  }

  if (!partial || has('nights')) {
    const raw = body.nights;
    // Only numbers and numeric text count; anything else (objects, lists, booleans) is simply not a valid number of nights.
    const nights = raw === undefined || raw === null || raw === '' ? 0 : typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (!Number.isInteger(nights) || nights < 0 || nights > LIMITS.maxNights) {
      return fail(`The number of nights must be a whole number from 0 to ${LIMITS.maxNights}.`);
    }
    data.nights = nights;
  }

  if (!partial || has('summary')) {
    const r = sanitizeRich(body.summary, { label: 'The overview', maxText: LIMITS.summary });
    if (!r.ok) return r;
    data.summary = r.value;
  }

  if (!partial || has('photos')) {
    const r = normalizePhotos(body.photos, 'The itinerary gallery', LIMITS.itineraryPhotos);
    if (!r.ok) return r;
    data.photos = r.value;
  }

  if (!partial || has('days')) {
    const r = normalizeDays(body.days ?? []);
    if (!r.ok) return r;
    data.days = r.value;
  }

  for (const key of ['inclusions', 'exclusions']) {
    if (!partial || has(key)) {
      const r = sanitizeRichList(body[key], { label: key === 'inclusions' ? 'Inclusions' : 'Exclusions', maxItems: LIMITS.listItems, maxText: LIMITS.listItemText });
      if (!r.ok) return r;
      data[key] = r.value;
    }
  }

  if (!partial || has('tags')) {
    const r = normalizeTags(body.tags ?? []);
    if (!r.ok) return r;
    data.tags = r.value;
  }

  if (has('status')) {
    if (!STATUSES.includes(body.status)) return fail(`Status must be one of: ${STATUSES.join(', ')}.`);
    data.status = body.status;
  }

  const photoTotal = (data.photos?.length || 0) + (data.days || []).reduce((sum, d) => sum + d.photos.length, 0);
  if (photoTotal > 120) return fail('This itinerary has too many photos (more than 120). Please remove some.');

  return { ok: true, data };
};

/** Every photo token an input mentions (to check they exist). */
export const photoTokensOf = (data) => [...(data.photos || []).map((p) => p.token), ...(data.days || []).flatMap((d) => d.photos.map((p) => p.token))];
