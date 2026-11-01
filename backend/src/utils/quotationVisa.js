import { line } from './itineraryInput.js';

// A visa quotation: what the visa is, how many people apply, and the fees. The price of the quotation is the fees: each fee is
// either charged per applicant (amount x applicants) or once for the whole group. The documents checklist and the inclusions are
// lists of lines (see quotationLists.js). Pure logic (no database), so it can be tested exhaustively.

export const VISA_LIMITS = { fees: 20, label: 80, text: 100, note: 200, applicants: 99, maxAmount: 1_000_000_000 };
export const FEE_UNITS = ['applicant', 'group'];
export const ENTRY_TYPES = ['', 'Single entry', 'Double entry', 'Multiple entry'];

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;

/** What the fees add up to: per-applicant fees times the applicants, plus the fees charged once for the group. */
export const visaFeeTotal = (fees, applicants) => {
  const people = Math.max(1, Number(applicants) || 1);
  return round2((fees || []).reduce((sum, f) => sum + (Number(f.amount) || 0) * (f.per === 'group' ? 1 : people), 0));
};

/**
 * @param {object} body what the client sent
 * @returns {{ ok: true, visa?: object, visaFees?: object[], total?: number } | { ok: false, message: string }}
 *   Only what the request carries is returned (an update that sends neither leaves them alone). `total` is only given when
 *   both the visa details (which hold the number of applicants) and the fees are present.
 */
export const normalizeQuotationVisa = (body) => {
  const L = VISA_LIMITS;
  const out = { ok: true };

  if (body.visa !== undefined) {
    if (!isPlainObject(body.visa)) return fail('The visa details must be a set of fields.');
    const v = body.visa;
    const visa = {};
    for (const [key, label, max] of [['country', 'the country', L.text], ['visaType', 'the visa type', L.text], ['mode', 'how the visa is issued', L.text], ['validity', 'the validity', L.text], ['stay', 'the maximum stay', L.text], ['processingTime', 'the processing time', L.text], ['priceNote', 'the price note', L.note]]) {
      const r = line(v[key], label, max);
      if (!r.ok) return r;
      visa[key] = r.value;
    }
    const entry = v.entryType === undefined || v.entryType === null ? '' : v.entryType;
    if (!ENTRY_TYPES.includes(entry)) return fail('Please choose the entry type from the list: single, double or multiple entry.');
    visa.entryType = entry;
    const raw = v.applicants === undefined || v.applicants === null || v.applicants === '' ? 1 : typeof v.applicants === 'number' || typeof v.applicants === 'string' ? Number(v.applicants) : Number.NaN;
    if (!Number.isInteger(raw) || raw < 1 || raw > L.applicants) return fail(`The number of applicants must be a whole number from 1 to ${L.applicants}.`);
    visa.applicants = raw;
    out.visa = visa;
  }

  if (body.visaFees !== undefined) {
    if (!Array.isArray(body.visaFees)) return fail('The fees must be a list.');
    if (body.visaFees.length > L.fees) return fail(`A visa quotation can have at most ${L.fees} fee lines (there are ${body.visaFees.length}).`);
    const fees = [];
    for (const [index, raw] of body.visaFees.entries()) {
      const n = index + 1;
      if (!isPlainObject(raw)) return fail(`Fee ${n} is not valid.`);
      const label = line(raw.label, `a name for fee ${n}`, L.label, { required: true });
      if (!label.ok) return label;
      const per = raw.per === undefined || raw.per === null || raw.per === '' ? 'applicant' : raw.per;
      if (!FEE_UNITS.includes(per)) return fail(`Please choose whether fee ${n} is per applicant or for the whole group.`);
      const amount = raw.amount === undefined || raw.amount === null || raw.amount === '' ? 0 : typeof raw.amount === 'number' || typeof raw.amount === 'string' ? Number(raw.amount) : Number.NaN;
      if (!Number.isFinite(amount) || amount < 0 || amount > L.maxAmount) return fail(`The amount of fee ${n} must be from 0 to ${L.maxAmount.toLocaleString('en-IN')}.`);
      fees.push({ label: label.value, amount: round2(amount), per });
    }
    out.visaFees = fees;
  }

  if (out.visa && out.visaFees) out.total = visaFeeTotal(out.visaFees, out.visa.applicants);
  return out;
};
