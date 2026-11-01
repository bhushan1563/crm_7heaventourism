import { sanitizeRichList } from './richText.js';

// The lists of lines on a quotation: inclusions, exclusions, payment and cancellation policy, vehicle notes, important notes.
// Each line is plain text (older quotations, the mobile app) or formatted text (bold, colour, highlight, size) made with the
// formatting editor. Formatted text is cleaned here, so nothing the browser sends can carry script. Blank lines are dropped.
// Pure logic (no database), so it can be tested exhaustively.

export const QUOTATION_LIST_LIMITS = { items: 100, text: 1000 };

// [where it lives, name used in messages]
const TOP_LEVEL_LISTS = [
  ['exclusions', 'The exclusions'],
  ['paymentPolicy', 'The payment policy'],
  ['cancellationPolicy', 'The cancellation policy'],
  ['vehicleNotes', 'The vehicle notes'],
  ['vehicleInclusions', 'The vehicle inclusions'],
  ['visaDocuments', 'The documents checklist'],
  ['visaInclusions', 'The visa inclusions'],
  ['importantNotes', 'The important notes']
];

/**
 * @param {object} body what the client sent
 * @returns {{ ok: true, lists: object, inclusions?: string[] } | { ok: false, message: string }}
 *   `lists` holds the cleaned top-level lists that the request carried; `inclusions` the cleaned package inclusions, if sent.
 */
export const normalizeQuotationLists = (body) => {
  const lists = {};
  const options = { maxItems: QUOTATION_LIST_LIMITS.items, maxText: QUOTATION_LIST_LIMITS.text };
  for (const [key, label] of TOP_LEVEL_LISTS) {
    if (body[key] === undefined) continue;
    const r = sanitizeRichList(body[key], { label, ...options });
    if (!r.ok) return r;
    lists[key] = r.value;
  }
  const out = { ok: true, lists };
  const details = body.packageDetails;
  if (details && typeof details === 'object' && details.inclusions !== undefined) {
    const r = sanitizeRichList(details.inclusions, { label: 'The inclusions', ...options });
    if (!r.ok) return r;
    out.inclusions = r.value;
  }
  return out;
};
