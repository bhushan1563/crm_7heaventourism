import { looksLikeHtml, sanitizeRich } from './richText.js';

// Short pieces of free text printed on a quotation (a price note, the room allocation, the end-of-tour banner ...) that staff can
// format: bold, colour, highlight, size. Plain text stays exactly as typed (as before); formatted text goes through the same
// sanitiser as every other formatted text, so what is stored can never carry script, links or odd styles. Pure logic (no database).

export const TEXT_LIMITS = { totalCostNote: 300, pricingNotes: 1000, endOfTourNote: 200, flightTicketNote: 500, roomInfo: 300 };

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const capitalise = (text) => `${text[0].toUpperCase()}${text.slice(1)}`;

/**
 * One line of text that may be formatted. Plain text is tidied like any one-line field (spaces collapsed, trimmed); formatted text
 * is sanitised and kept. `max` is the number of visible characters.
 * @returns {{ ok: true, value: string } | { ok: false, message: string }}
 */
export const richLine = (value, label, max) => {
  if (value === undefined || value === null) return { ok: true, value: '' };
  const r = sanitizeRich(value, { label: capitalise(label), maxText: max });
  if (!r.ok) return r;
  return { ok: true, value: looksLikeHtml(r.value) ? r.value : r.value.replace(/\s+/g, ' ').trim() };
};

/** A paragraph of text that may be formatted: plain text keeps its line breaks. */
export const richParagraph = (value, label, max) => {
  if (value === undefined || value === null) return { ok: true, value: '' };
  const r = sanitizeRich(value, { label: capitalise(label), maxText: max });
  if (!r.ok) return r;
  return { ok: true, value: looksLikeHtml(r.value) ? r.value : r.value.trim() };
};

/**
 * The formattable texts of a request body: the price line and the pricing notes, the room allocation, the flight ticket note and
 * the end-of-tour banner. Only what the request carries is returned.
 * @returns {{ ok: true, pricing?: object, roomInfo?: string, flightTicketNote?: string, endOfTourNote?: string } | { ok: false, message: string }}
 */
export const normalizeQuotationText = (body) => {
  const L = TEXT_LIMITS;
  const out = { ok: true };

  if (isPlainObject(body.pricing)) {
    const pricing = {};
    if (body.pricing.totalCostNote !== undefined) {
      const r = richLine(body.pricing.totalCostNote, 'the price line', L.totalCostNote);
      if (!r.ok) return r;
      pricing.totalCostNote = r.value;
    }
    if (body.pricing.notes !== undefined) {
      const r = richParagraph(body.pricing.notes, 'the pricing notes', L.pricingNotes);
      if (!r.ok) return r;
      pricing.notes = r.value;
    }
    if (Object.keys(pricing).length) out.pricing = pricing;
  }

  if (isPlainObject(body.packageDetails) && body.packageDetails.roomInfo !== undefined) {
    const r = richLine(body.packageDetails.roomInfo, 'the room allocation', L.roomInfo);
    if (!r.ok) return r;
    out.roomInfo = r.value;
  }

  for (const [key, label, max] of [['flightTicketNote', 'the flight ticket note', L.flightTicketNote], ['endOfTourNote', 'the end-of-tour note', L.endOfTourNote]]) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== 'string') return fail(`${capitalise(label)} must be text.`);
    const r = key === 'flightTicketNote' ? richParagraph(body[key], label, max) : richLine(body[key], label, max); // the flight note is a few lines long
    if (!r.ok) return r;
    out[key] = r.value;
  }
  return out;
};
