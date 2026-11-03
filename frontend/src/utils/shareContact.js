// Sharing a quotation with the client: the WhatsApp number and the e-mail address (checked, with problems told in plain words), the
// message, the two links and the file name. Pure functions (no network, no React) so every rule can be tested.
import { formatDate } from './dateHelper';

export const SHARE_LIMITS = { message: 1000, subject: 150, email: 254 };
const DEFAULT_COUNTRY = '91'; // numbers typed without a country code are Indian

/**
 * Checks a WhatsApp number. Accepts what people really type: spaces, dashes, dots, brackets, "+91", "0091", a leading 0, or just the
 * ten digits. Returns `{ ok: true, digits, display }` (digits with the country code, ready for wa.me) or `{ ok: false, empty, message }`.
 */
export const whatsappNumber = (raw, defaultCountry = DEFAULT_COUNTRY) => {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, empty: true, message: "Enter the client's WhatsApp number, with the country code if it is not an Indian number." };
  if (/[A-Za-z]/.test(text)) return { ok: false, message: 'A phone number can only have digits, spaces, "+" and "-". Please check it.' };
  let rest = text.replace(/[\s().\- ]/g, '');
  let international = false;
  if (rest.startsWith('+')) {
    international = true;
    rest = rest.slice(1);
  } else if (rest.startsWith('00')) {
    international = true;
    rest = rest.slice(2);
  }
  if (!/^\d+$/.test(rest)) return { ok: false, message: 'A phone number can only have digits, spaces, "+" and "-". Please check it.' };

  let digits = rest;
  if (international) {
    if (digits.startsWith('0')) return { ok: false, message: 'A country code never starts with 0. Please check the number.' };
    if (digits.length < 8) return { ok: false, message: 'That number looks too short. Please check it.' };
  } else {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // the 0 in front of an Indian number
    if (digits.startsWith('0')) return { ok: false, message: 'That number should not start with 0. Please check it, or add the country code, for example +91.' };
    if (digits.length < 10) return { ok: false, message: 'That number looks too short. Indian numbers have 10 digits; for another country add the country code, for example +971 50 123 4567.' };
    if (digits.length === 10) digits = `${defaultCountry}${digits}`; // typed without the country code
  }
  if (digits.length > 15) return { ok: false, message: 'That number looks too long. Please check it.' };
  const display = digits.length === 12 && digits.startsWith('91') ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : `+${digits}`;
  return { ok: true, digits, display };
};

/** Checks one e-mail address. Returns `{ ok: true, value }` or `{ ok: false, empty, message }`. */
export const emailAddress = (raw) => {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, empty: true, message: "Enter the client's e-mail address." };
  if (/[,;\s]/.test(value)) return { ok: false, message: 'Enter one e-mail address, for example name@example.com.' };
  if (value.length > SHARE_LIMITS.email || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) return { ok: false, message: 'That does not look like an e-mail address. It should be like name@example.com.' };
  return { ok: true, value };
};

export const whatsappLink = (digits, message) => `https://wa.me/${digits}?text=${encodeURIComponent(String(message || '').slice(0, SHARE_LIMITS.message))}`;

export const mailtoLink = (to, subject, body) => `mailto:${to}?subject=${encodeURIComponent(String(subject || '').slice(0, SHARE_LIMITS.subject))}&body=${encodeURIComponent(String(body || '').slice(0, SHARE_LIMITS.message))}`;

/** The same name the quotation list gives its PDF, so a file is called the same wherever it is saved from. */
export const shareFileName = (quotation, extension) => {
  const destination = String(quotation?.destination || '7Heaven').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || '7Heaven';
  return `7Heaven_Quotation_${destination}_${quotation?.quotationNo || 'Doc'}.${extension}`;
};

export const FORMAT_LABELS = { pdf: 'PDF', docx: 'Word' };

const clip = (value, length) => String(value || '').trim().slice(0, length);

/** A friendly message to start from; the person can change every word of it before sending. */
export const defaultShareMessage = ({ quotation, format = 'pdf', senderName = '', company = {} }) => {
  const client = clip(quotation?.clientName, 80);
  const lines = [
    client ? `Hello ${client},` : 'Hello,',
    '',
    `Greetings from ${company.name ? company.name.replace(/\s+/g, ' ') : '7Heaven Tourism'}! Please find your ${clip(quotation?.destination, 80) || 'travel'} quotation${quotation?.quotationNo ? ` (${quotation.quotationNo})` : ''} attached as a ${FORMAT_LABELS[format] || 'PDF'} file.`
  ];
  if (quotation?.travelDate) lines.push(`Travel date: ${formatDate(quotation.travelDate)}`);
  lines.push('', 'Please let us know if you would like any changes.', '', 'Warm regards,', clip(senderName, 60) || 'The 7Heaven Tourism team');
  if (company.phone) lines.push(company.phone);
  return lines.join('\n').slice(0, SHARE_LIMITS.message);
};

export const defaultEmailSubject = (quotation) => clip(`7Heaven Tourism: ${quotation?.destination || 'Travel'} quotation${quotation?.quotationNo ? ` ${quotation.quotationNo}` : ''}`, SHARE_LIMITS.subject);

/**
 * What to save back on the quotation after sharing: only the contact details the person typed that the quotation did not have.
 * The same number in another format (+91 98765 43210 against 9876543210) is not a change.
 */
export const contactToSave = (quotation, phone, email) => {
  const patch = {};
  if (phone?.ok) {
    const had = whatsappNumber(quotation?.clientPhone);
    if (!had.ok || had.digits !== phone.digits) patch.clientPhone = phone.display;
  }
  if (email?.ok && String(quotation?.clientEmail || '').trim().toLowerCase() !== email.value.toLowerCase()) patch.clientEmail = email.value;
  return patch;
};

/** The number to show first in the window: the quotation's own, as typed; nothing when it has none (the window then asks). */
export const startingPhone = (quotation) => String(quotation?.clientPhone || '').trim();
export const startingEmail = (quotation) => String(quotation?.clientEmail || '').trim();
