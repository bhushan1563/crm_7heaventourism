// Visa quotations: what the visa is, the documents the applicant must bring (an editable checklist), and the fees. Pure functions
// (no network, no React) so every rule can be tested. The price IS the fees: each fee is charged per applicant or once for the group.
import { guestCount } from './quotationOptions';

export const VISA = 'Visa';
export const isVisa = (quotation) => (quotation?.quotationType || '') === VISA;

export const VISA_LIMITS = { fees: 20, label: 80, text: 100, note: 200, applicants: 99 };

export const ENTRY_CHOICES = [
  { value: '', label: 'Not specified' },
  { value: 'Single entry', label: 'Single entry' },
  { value: 'Double entry', label: 'Double entry' },
  { value: 'Multiple entry', label: 'Multiple entry' }
];

export const FEE_UNITS = [
  { value: 'applicant', label: 'Per applicant' },
  { value: 'group', label: 'Whole group' }
];

/** One-click suggestions; the fields themselves accept anything typed. */
export const VISA_TYPE_SUGGESTIONS = ['Tourist', 'Business', 'Transit', 'Student', 'Medical', 'Work', 'Family visit', 'Conference'];
export const VISA_MODE_SUGGESTIONS = ['e-Visa', 'Sticker visa', 'Visa on arrival', 'Embassy / consulate visa'];

/**
 * A generic checklist offered by the "Add the standard checklist" button. Requirements differ by country and visa type, so the
 * checklist of a new visa quotation starts EMPTY and this is only a starting point to be edited for the country.
 */
export const STANDARD_DOCUMENTS = [
  'Passport with at least 6 months validity and 2 blank pages',
  'Recent passport-size photographs (white background)',
  'Copy of ID proof (Aadhaar / PAN card)',
  'Bank statement of the last 6 months',
  'Income tax returns of the last 2 years',
  'Confirmed return flight tickets and hotel bookings',
  'Covering letter / NOC from the employer or business proof'
];

const PERSON_WORDS = 'adults?|child(?:ren)?|kids?|infants?|toddlers?|teens?|seniors?|pax|guests?|persons?|people|travell?ers?|members?';

/**
 * How many people need a visa, from the guests text: every traveller counts, children included ("3 Adults + 1 Child" is 4).
 * A number counts only when it is followed by a word for a person, so a child's age ("1 Child (5 yrs)") is not mistaken for a
 * head count. Without such words the first number is used, as everywhere else; without any number it is 1.
 */
export const applicantCount = (paxDetails) => {
  const text = String(paxDetails || '');
  let sum = 0;
  for (const m of text.matchAll(new RegExp(`(\\d+)\\s*(?:${PERSON_WORDS})\\b`, 'gi'))) sum += parseInt(m[1], 10);
  if (sum > 0) return Math.min(VISA_LIMITS.applicants, sum);
  return Math.min(VISA_LIMITS.applicants, guestCount(text));
};

/**
 * The patch for `visa` when the guests text changes: the applicants follow the guests, but only while they still equal what the
 * old guests text gave. Once someone has set the number by hand it is left alone.
 */
export const followGuests = (quotation, newPaxDetails) => {
  if (!isVisa(quotation)) return {};
  const visa = quotation.visa || {};
  if (Number(visa.applicants) !== applicantCount(quotation.paxDetails)) return {};
  return { visa: { ...visa, applicants: applicantCount(newPaxDetails) } };
};

export const blankFee = (label = '') => ({ label, amount: '', per: 'applicant' });

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** What one fee costs for this group: per-applicant fees are multiplied by the applicants; group fees are charged once. */
export const feeAmount = (fee, applicants) => round2((Number(fee.amount) || 0) * (fee.per === 'group' ? 1 : Math.max(1, Number(applicants) || 1)));

/** The price of the quotation: the sum of its fees. */
export const visaFeeTotal = (fees, applicants) => round2((fees || []).reduce((sum, f) => sum + feeAmount(f, applicants), 0));

/** What a quotation gets when the user turns it into a visa quotation (nothing already typed is lost). */
export const startVisa = (quotation) => ({
  visa: { country: '', visaType: '', entryType: '', mode: '', validity: '', stay: '', processingTime: '', priceNote: '', ...(quotation.visa || {}), applicants: Number(quotation.visa?.applicants) > 1 ? quotation.visa.applicants : applicantCount(quotation.paxDetails) },
  visaFees: quotation.visaFees?.length ? quotation.visaFees : [blankFee('Visa fee'), blankFee('Service charge')]
});

/** Adds the lines of the standard checklist that are not already there (ignoring case and spacing). */
export const addStandardDocuments = (documents) => {
  const key = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
  const have = new Set((documents || []).map(key));
  return [...(documents || []), ...STANDARD_DOCUMENTS.filter((d) => !have.has(key(d)))];
};

/**
 * What stops a visa quotation from being saved, or null: `{ message, tab }` with the problem in plain words and the id of the tab
 * where it is fixed. The country, a sensible number of applicants, and at least one fee with a name and an amount are needed.
 * (The server repeats these checks.)
 */
export const visaIssue = (quotation) => {
  if (!isVisa(quotation)) return null;
  const visa = quotation.visa || {};
  if (!String(visa.country || '').trim()) return { tab: 'visa', message: 'Please enter the country the visa is for, on the "Visa & Documents" tab.' };
  const applicants = Number(visa.applicants);
  if (!Number.isInteger(applicants) || applicants < 1 || applicants > VISA_LIMITS.applicants) return { tab: 'visa', message: `The number of applicants must be a whole number from 1 to ${VISA_LIMITS.applicants}.` };
  const fees = quotation.visaFees || [];
  if (!fees.length) return { tab: 'visaFees', message: 'A visa quotation needs at least one fee. On the "Fees & Services" tab, add the visa fee and your service charge.' };
  for (const [i, fee] of fees.entries()) {
    if (!String(fee.label || '').trim()) return { tab: 'visaFees', message: `Please enter a name for fee ${i + 1}, or remove that line.` };
    if (!(Number(fee.amount) > 0)) return { tab: 'visaFees', message: `Please enter the amount of "${fee.label.trim()}" (fee ${i + 1}).` };
  }
  return null;
};

export const visaProblem = (quotation) => visaIssue(quotation)?.message ?? null;

/** The fees as the server wants them. */
export const feesPayload = (fees) => (fees || []).map((f) => ({ label: String(f.label || '').trim(), amount: Number(f.amount) || 0, per: f.per === 'group' ? 'group' : 'applicant' }));

/** The visa details as the server wants them (the applicants as a number). */
export const visaPayload = (visa) => ({ ...(visa || {}), applicants: Number(visa?.applicants) || 1 });
