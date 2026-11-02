// The visa list: saved visa products (a country, a kind of visa, an entry type) with what each needs and usually costs. Pure functions
// (no network, no React) so every rule can be tested. A visa of the list is shaped like the visa part of a quotation, so the same
// editor works for both and a visa fits straight into a quotation.
import { blankFee, feesPayload } from './visa';
import { richToPlainText } from './richText';

export const VISA_LIST_LIMITS = { notes: 1000 };

export const emptyVisaItem = () => ({
  visa: { country: '', visaType: '', entryType: '', mode: '', validity: '', stay: '', processingTime: '', priceNote: '', applicants: 1 },
  visaFees: [blankFee('Visa fee'), blankFee('Service charge')],
  visaDocuments: [],
  visaInclusions: [],
  notes: '',
  status: 'Active'
});

/** A stored visa as the editor holds it. */
export const formFromVisaItem = (item = {}) => {
  const base = emptyVisaItem();
  return {
    visa: { ...base.visa, ...Object.fromEntries(Object.keys(base.visa).filter((k) => k !== 'applicants').map((k) => [k, item[k] ?? ''])), applicants: 1 },
    visaFees: (item.fees || []).map((f) => ({ label: f.label || '', amount: f.amount ?? '', per: f.per === 'group' ? 'group' : 'applicant' })),
    visaDocuments: [...(item.documents || [])],
    visaInclusions: [...(item.inclusions || [])],
    notes: item.notes || '',
    status: item.status || 'Active'
  };
};

/** The editor's state as the server wants it. */
export const visaItemPayload = (form) => {
  const v = form.visa;
  return {
    country: v.country.trim(),
    visaType: v.visaType.trim(),
    entryType: v.entryType || '',
    mode: v.mode.trim(),
    validity: v.validity.trim(),
    stay: v.stay.trim(),
    processingTime: v.processingTime.trim(),
    priceNote: v.priceNote || '',
    fees: feesPayload(form.visaFees),
    documents: form.visaDocuments,
    inclusions: form.visaInclusions,
    notes: form.notes || ''
  };
};

/** What stops a visa from being saved to the list, in plain words, or null. (The server repeats the checks.) */
export const visaItemProblem = (form) => {
  if (!form.visa.country.trim()) return 'Please enter the country this visa is for.';
  for (const [i, fee] of form.visaFees.entries()) {
    if (!String(fee.label || '').trim()) return `Please enter a name for fee ${i + 1}, or remove that line.`;
    const amount = fee.amount === '' || fee.amount === null || fee.amount === undefined ? 0 : Number(fee.amount);
    if (!Number.isFinite(amount) || amount < 0) return `The amount of "${fee.label.trim()}" (fee ${i + 1}) must be a number, 0 or more.`;
  }
  if ((form.notes || '').length > VISA_LIST_LIMITS.notes) return `The internal notes are too long (the limit is ${VISA_LIST_LIMITS.notes} characters).`;
  return null;
};

/** The title a quotation made from this visa starts with, e.g. UNITED ARAB EMIRATES TOURIST VISA. */
export const visaTitle = (item) => [item.country, item.visaType, 'VISA'].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();

/** What a person pays for this visa, for one applicant: the fees charged per applicant (those charged once for the group are shown apart). */
export const perApplicantTotal = (fees = []) => Math.round(fees.filter((f) => f.per !== 'group').reduce((sum, f) => sum + (Number(f.amount) || 0), 0) * 100) / 100;
export const groupTotal = (fees = []) => Math.round(fees.filter((f) => f.per === 'group').reduce((sum, f) => sum + (Number(f.amount) || 0), 0) * 100) / 100;

/** A short line for a list: "Rs 8,000 per applicant + Rs 800 once", or "Fees not set". */
export const feeSummary = (fees = []) => {
  const each = perApplicantTotal(fees);
  const once = groupTotal(fees);
  const parts = [each > 0 ? `Rs ${each.toLocaleString('en-IN')} per applicant` : '', once > 0 ? `Rs ${once.toLocaleString('en-IN')} once` : ''].filter(Boolean);
  return parts.length ? parts.join(' + ') : 'Fees not set';
};

/** True when a visa quotation already has something typed that picking a visa from the list would replace. */
export const hasVisaContent = (quotation) => {
  const v = quotation.visa || {};
  return Boolean(
    String(v.country || '').trim() ||
      (quotation.visaDocuments || []).some((d) => richToPlainText(d).trim()) ||
      (quotation.visaFees || []).some((f) => Number(f.amount) > 0) ||
      (quotation.visaInclusions || []).some((d) => richToPlainText(d).trim())
  );
};

/**
 * The fields a quotation takes from a visa of the list: the details, the checklist, the usual fees and the inclusions. The number of
 * applicants and the fees' amounts are the quotation's own (a fee the list has no amount for stays blank for the person to fill in).
 */
export const applyVisaItem = (quotation, item) => ({
  visa: {
    ...(quotation.visa || {}),
    country: item.country || '',
    visaType: item.visaType || '',
    entryType: item.entryType || '',
    mode: item.mode || '',
    validity: item.validity || '',
    stay: item.stay || '',
    processingTime: item.processingTime || '',
    priceNote: item.priceNote || '',
    applicants: Number(quotation.visa?.applicants) > 0 ? quotation.visa.applicants : 1
  },
  visaFees: (item.fees?.length ? item.fees : [{ label: 'Visa fee' }, { label: 'Service charge' }]).map((f) => ({ label: f.label, amount: Number(f.amount) > 0 ? f.amount : '', per: f.per === 'group' ? 'group' : 'applicant' })),
  visaDocuments: [...(item.documents || [])],
  visaInclusions: [...(item.inclusions || [])]
});
