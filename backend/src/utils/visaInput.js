import { normalizeQuotationVisa } from './quotationVisa.js';
import { normalizeQuotationLists } from './quotationLists.js';
import { richParagraph } from './quotationText.js';

// What a visa in the visa list is made of, cleaned. It reuses the rules of a visa quotation (the same details, fees and checklist
// lines), so what is saved here fits straight into a quotation. Pure logic (no database), so it can be tested exhaustively.

export const VISA_ITEM_LIMITS = { notes: 1000 };
const DETAIL_KEYS = ['country', 'visaType', 'entryType', 'mode', 'validity', 'stay', 'processingTime', 'priceNote'];
export const STATUSES = ['Active', 'Archived'];

const fail = (message) => ({ ok: false, message });
const tidy = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The identity of a visa: country, kind and entry type. Two visas with the same key are the same visa. */
export const visaNameKey = (country, visaType, entryType) => [country, visaType, entryType].map(tidy).join('|');

/**
 * @param {object} body what the client sent
 * @param {{ partial?: boolean }} [options] partial: an update that carries only some fields (archiving sends only the status)
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export const normalizeVisaInput = (body, { partial = false } = {}) => {
  const data = {};
  const sent = DETAIL_KEYS.filter((key) => body[key] !== undefined);

  if (sent.length || !partial) {
    const r = normalizeQuotationVisa({ visa: { ...Object.fromEntries(DETAIL_KEYS.map((key) => [key, body[key]])), applicants: 1 } });
    if (!r.ok) return r;
    for (const key of partial ? sent : DETAIL_KEYS) data[key] = r.visa[key];
    if ((!partial || sent.includes('country')) && !r.visa.country) return fail('Please enter the country this visa is for.');
  }

  if (body.fees !== undefined) {
    const r = normalizeQuotationVisa({ visaFees: body.fees });
    if (!r.ok) return r;
    data.fees = r.visaFees;
  }

  if (body.documents !== undefined || body.inclusions !== undefined) {
    const r = normalizeQuotationLists({ visaDocuments: body.documents, visaInclusions: body.inclusions });
    if (!r.ok) return r;
    if (body.documents !== undefined) data.documents = r.lists.visaDocuments;
    if (body.inclusions !== undefined) data.inclusions = r.lists.visaInclusions;
  }

  if (body.notes !== undefined) {
    const r = richParagraph(body.notes, 'the internal notes', VISA_ITEM_LIMITS.notes);
    if (!r.ok) return r;
    data.notes = r.value;
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return fail('The status must be Active or Archived.');
    data.status = body.status;
  }
  return { ok: true, data };
};
