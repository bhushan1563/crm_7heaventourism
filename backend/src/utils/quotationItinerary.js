import { line, normalizePhotos } from './itineraryInput.js';
import { sanitizeRich } from './richText.js';

// The day-by-day part of a quotation. Days written before photos and formatting existed (and days sent by the mobile app)
// are plain text with no photos; they stay valid exactly as they were. New days may carry formatted text and photos.
// Pure logic (no database), so it can be tested exhaustively. The controller confirms the photos exist.

export const QUOTATION_DAY_LIMITS = {
  maxDays: 60,
  dayNumber: 30,
  title: 150,
  description: 20000,
  meals: 120,
  stay: 120,
  photosPerDay: 6,
  totalPhotos: 120
};

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {unknown} value the `itinerary` list a client sent
 * @returns {{ ok: true, value: object[] } | { ok: false, message: string }}
 */
export const normalizeQuotationItinerary = (value) => {
  if (!Array.isArray(value)) return fail('The days of the itinerary must be a list.');
  const L = QUOTATION_DAY_LIMITS;
  if (value.length > L.maxDays) return fail(`An itinerary can have at most ${L.maxDays} days (there are ${value.length}).`);
  const days = [];
  let photoTotal = 0;
  for (const [index, raw] of value.entries()) {
    const n = index + 1;
    if (!isPlainObject(raw)) return fail(`Day ${n} is not valid.`);
    const dayNumber = line(raw.dayNumber, `the day number of Day ${n}`, L.dayNumber);
    if (!dayNumber.ok) return dayNumber;
    const title = line(raw.title, `the title of Day ${n}`, L.title);
    if (!title.ok) return title;
    const description = sanitizeRich(raw.description, { label: `The description of Day ${n}`, maxText: L.description });
    if (!description.ok) return description;
    const stay = line(raw.stay, `the overnight stay of Day ${n}`, L.stay);
    if (!stay.ok) return stay;
    const meals = line(raw.meals, `the meals of Day ${n}`, L.meals);
    if (!meals.ok) return meals;
    const photos = normalizePhotos(raw.photos, `Day ${n}`, L.photosPerDay);
    if (!photos.ok) return photos;
    photoTotal += photos.value.length;
    days.push({
      dayNumber: dayNumber.value || `Day ${String(n).padStart(2, '0')}`,
      title: title.value,
      description: description.value,
      stay: stay.value,
      meals: meals.value,
      photos: photos.value
    });
  }
  if (photoTotal > L.totalPhotos) return fail(`This quotation has too many itinerary photos (more than ${L.totalPhotos}). Please remove some.`);
  return { ok: true, value: days };
};

/** Every photo token the days mention (to confirm they exist). */
export const itineraryPhotoTokens = (days) => days.flatMap((d) => d.photos.map((p) => p.token));
