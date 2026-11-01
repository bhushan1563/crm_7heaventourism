// Copying a saved itinerary into a quotation. Pure functions (no network, no React) so every rule can be tested.
// The quotation gets its own copy: editing it never changes the library original, and later library edits never change
// quotations that already used it.
import { formatDuration } from './itinerary';
import { richToPlainText } from './richText';

// Same limits the server enforces for the days of a quotation.
export const QUOTATION_LIMITS = { maxDays: 60, totalPhotos: 120 };

export const dayLabel = (number) => `Day ${String(number).padStart(2, '0')}`;

const toQuotationDay = (day, number) => ({
  dayNumber: dayLabel(number),
  title: day.title || '',
  description: day.description || '',
  stay: day.stay || '',
  meals: day.meals || '',
  photos: (day.photos || []).map(({ token, width, height, caption }) => ({ token, width, height, caption: caption || '' }))
});

export const photoCount = (days = []) => days.reduce((sum, d) => sum + (d.photos?.length || 0), 0);

/**
 * The days a quotation has after an itinerary is inserted.
 * @param {object[]} currentDays the quotation's days now
 * @param {object} itinerary the saved itinerary (as the API returns it)
 * @param {'replace' | 'append'} mode replace the current days, or add the new ones after them
 * @returns {{ ok: true, days: object[], added: number } | { ok: false, message: string }}
 */
export const insertItinerary = (currentDays, itinerary, mode = 'replace') => {
  const kept = mode === 'append' ? currentDays || [] : [];
  const incoming = itinerary?.days || [];
  if (!incoming.length) return { ok: false, message: 'This itinerary has no days yet. Open it in the library and add its days first.' };
  if (kept.length + incoming.length > QUOTATION_LIMITS.maxDays) {
    return { ok: false, message: `A quotation can have at most ${QUOTATION_LIMITS.maxDays} days, and this would make ${kept.length + incoming.length}. Choose "Replace the days" or remove some days first.` };
  }
  const days = [...kept, ...incoming.map((day, i) => toQuotationDay(day, kept.length + i + 1))];
  if (photoCount(days) > QUOTATION_LIMITS.totalPhotos) {
    return { ok: false, message: `The days of a quotation can have at most ${QUOTATION_LIMITS.totalPhotos} photos in total, and this would make ${photoCount(days)}. Choose "Replace the days" or remove some photos first.` };
  }
  return { ok: true, days, added: incoming.length };
};

/** Inclusion / exclusion lines as plain single lines (the quotation lists are plain text). Blank lines are dropped. */
export const plainLines = (items = []) =>
  items
    .map((item) => richToPlainText(item).replace(/\s*\n+\s*/g, ' ').trim())
    .filter(Boolean);

/** `current` with the lines of `extra` added after it; a line that is already there (ignoring case and spacing) is not repeated. */
export const mergeLines = (current = [], extra = []) => {
  const key = (line) => String(line).replace(/\s+/g, ' ').trim().toLowerCase();
  const seen = new Set(current.map(key));
  const out = [...current];
  for (const line of extra) {
    if (!seen.has(key(line))) {
      seen.add(key(line));
      out.push(line);
    }
  }
  return out;
};

/** The quotation's destination and duration taken from the itinerary, only where the quotation has none yet. */
export const detailsFrom = (quotation, itinerary) => {
  const patch = {};
  if (!String(quotation?.destination || '').trim()) patch.destination = [itinerary.destination, itinerary.country].filter(Boolean).join(', ');
  if (!String(quotation?.duration || '').trim()) patch.duration = formatDuration(itinerary.nights);
  return patch;
};
