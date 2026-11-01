// Shared logic for the itinerary screens: the empty form, the checks that run before saving (the server repeats them),
// and the small formatting helpers. No React in here, so it is easy to test.
import { richToPlainText } from './richText';

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
  tagLength: 30
};

export const emptyDay = () => ({ title: '', description: '', meals: '', stay: '', photos: [] });

export const emptyItinerary = () => ({
  title: '',
  destination: '',
  country: '',
  nights: 0,
  summary: '',
  photos: [],
  days: [emptyDay()],
  inclusions: [],
  exclusions: [],
  tags: [],
  status: 'Active'
});

/** "5 Nights / 6 Days", "1 Night / 2 Days", "Day trip". */
export const formatDuration = (nights) => {
  const n = Number(nights) || 0;
  if (n <= 0) return 'Day trip';
  return `${n} ${n === 1 ? 'Night' : 'Nights'} / ${n + 1} Days`;
};

/** A short plain-text preview of formatted text. */
export const excerpt = (value, max = 140) => {
  const text = richToPlainText(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

/** The form as the server wants it (no editor-only fields). */
export const toPayload = (form) => ({
  title: form.title,
  destination: form.destination,
  country: form.country,
  nights: Number(form.nights) || 0,
  summary: form.summary,
  photos: form.photos.map(({ token, caption }) => ({ token, caption: caption || '' })),
  days: form.days.map((d) => ({
    title: d.title,
    description: d.description,
    meals: d.meals,
    stay: d.stay,
    photos: (d.photos || []).map(({ token, caption }) => ({ token, caption: caption || '' }))
  })),
  inclusions: form.inclusions,
  exclusions: form.exclusions,
  tags: form.tags,
  status: form.status
});

/**
 * Problems found before saving, keyed so the screen can show each one next to its field.
 * Keys: title, destination, nights, days (list-level), `day-<index>` for a day's title, tags.
 */
export const validateItinerary = (form) => {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Please enter a title for the itinerary.';
  else if (form.title.trim().length > LIMITS.title) errors.title = `The title is too long (${form.title.trim().length} characters; the limit is ${LIMITS.title}).`;

  if (!form.destination.trim()) errors.destination = 'Please enter the destination.';
  else if (form.destination.trim().length > LIMITS.destination) errors.destination = `The destination is too long (the limit is ${LIMITS.destination} characters).`;

  const nights = Number(form.nights);
  if (!Number.isInteger(nights) || nights < 0 || nights > LIMITS.maxNights) errors.nights = `The number of nights must be a whole number from 0 to ${LIMITS.maxNights}.`;

  if (form.days.length > LIMITS.maxDays) errors.days = `An itinerary can have at most ${LIMITS.maxDays} days.`;
  form.days.forEach((day, index) => {
    if (!day.title.trim()) errors[`day-${index}`] = `Please enter a title for Day ${index + 1}.`;
    else if (day.title.trim().length > LIMITS.dayTitle) errors[`day-${index}`] = `The title of Day ${index + 1} is too long (the limit is ${LIMITS.dayTitle} characters).`;
  });
  return errors;
};

/** Which field (and its element id) to show first when several things are wrong. */
export const firstErrorKey = (errors, form) => {
  for (const key of ['title', 'destination', 'nights', 'days']) if (errors[key]) return key;
  const day = form.days.findIndex((_, i) => errors[`day-${i}`]);
  return day >= 0 ? `day-${day}` : null;
};

/**
 * Adds a short label to a list (no duplicates, within the limits). Returns the new list, or an error message.
 * By default it adds an itinerary tag (lower case, up to 10); other lists pass their own rules, e.g. a hotel's amenities.
 */
export const addTag = (tags, raw, { max = LIMITS.tags, maxLength = LIMITS.tagLength, lower = true, noun = 'tag', plural = 'tags', owner = 'An itinerary' } = {}) => {
  const text = String(raw || '').trim().replace(/\s+/g, ' ');
  const tag = lower ? text.toLowerCase() : text;
  if (!tag) return { tags };
  if (tag.length > maxLength) return { tags, error: `Each ${noun} can have at most ${maxLength} characters.` };
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return { tags };
  if (tags.length >= max) return { tags, error: `${owner} can have at most ${max} ${plural}.` };
  return { tags: [...tags, tag] };
};

/** Moves an item inside a list (used by the day up / down buttons). */
export const moveItem = (list, from, to) => {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};
