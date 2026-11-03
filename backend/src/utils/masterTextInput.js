import { sanitizeRichList } from './richText.js';

// The standard Notes and Policy texts that an Admin edits: five lists of lines, each line plain or formatted text. Pure logic (no
// database), so it can be tested exhaustively. Formatted text is cleaned here, so nothing the browser sends can carry script.

export const MASTER_LIMITS = { items: 100, text: 1000 };

// [where it lives, name used in messages]
export const MASTER_LISTS = [
  ['importantNotes', 'The important notes'],
  ['paymentPolicy', 'The payment policy'],
  ['cancellationPolicy', 'The cancellation policy'],
  ['exclusions', 'The exclusions'],
  ['vehicleNotes', 'The vehicle notes']
];

/**
 * @param {object} body what the browser sent: all five lists (a list may be empty, which means "start with none")
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export const normalizeMasterText = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'The standard text must be sent as a set of lists.' };
  const data = {};
  for (const [key, label] of MASTER_LISTS) {
    // Every list has to be sent: a request that leaves one out would otherwise empty it by accident.
    if (body[key] === undefined || body[key] === null) return { ok: false, message: `${label} is missing. Please send all five lists.` };
    const r = sanitizeRichList(body[key], { label, maxItems: MASTER_LIMITS.items, maxText: MASTER_LIMITS.text });
    if (!r.ok) return r;
    data[key] = r.value;
  }
  return { ok: true, data };
};
