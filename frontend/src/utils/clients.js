// The clients page: the future clients kept by hand (their form, checks and payload) and the searching, e-mail and WhatsApp helpers
// both lists use. Pure functions (no network, no React) so every rule can be tested. The server repeats the checks.
import { whatsappNumber } from './shareContact';

export const CLIENT_LIMITS = { name: 100, phone: 30, email: 254, destination: 100, expectedTravel: 60, budget: 40, source: 40, notes: 1000 };
export const CLIENT_SOURCES = ['Instagram', 'Facebook', 'Google', 'Website', 'Reference', 'Walk-in', 'Other'];

const PHONE = /^\+?[0-9][0-9 ().-]{4,28}$/;
const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;
const FIELDS = ['name', 'phone', 'email', 'destination', 'expectedTravel', 'budget', 'source', 'notes'];

export const blankClient = () => Object.fromEntries(FIELDS.map((f) => [f, '']));

/** A saved future client as the form holds it (text for every input). */
export const clientForm = (c) => Object.fromEntries(FIELDS.map((f) => [f, String(c?.[f] ?? '')]));

/** The form as the server wants it: every field trimmed. */
export const clientPayload = (form) => Object.fromEntries(FIELDS.map((f) => [f, String(form?.[f] ?? '').trim()]));

/** What stops a future client from being saved, in plain words: an object keyed by the field to fix. Empty when all is well. */
export const clientErrors = (form) => {
  const p = clientPayload(form);
  const L = CLIENT_LIMITS;
  const errors = {};
  if (!p.name) errors.name = 'Please enter the name of the client.';
  for (const field of FIELDS) {
    if (p[field].length > L[field] && !errors[field]) errors[field] = `This is too long (${p[field].length} characters; the limit is ${L[field]}).`;
  }
  if (p.phone && !errors.phone && !PHONE.test(p.phone)) errors.phone = 'The phone number can only have digits, spaces, "+", "-", "(" and ")".';
  if (p.email && !errors.email && !EMAIL.test(p.email)) errors.email = 'The e-mail address does not look right. It should be like name@example.com.';
  return errors;
};

/** Does a client (a current one or a future one) match what was typed in the search box? Every word typed must be found somewhere. */
export const matchesClient = (client, query) => {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [client.name, client.email, client.phone, ...(client.emails || []), ...(client.phones || []), client.destination, client.expectedTravel, client.budget, client.source, client.notes, client.status, client.sales]
    .map((v) => String(v ?? '').toLowerCase()).join(' ');
  const digits = hay.replace(/\D/g, '');
  return words.every((w) => hay.includes(w) || (/^\d{3,}$/.test(w) && digits.includes(w)));
};

/** Every e-mail address of the clients, each once (in any letter case), for pasting into a mail program. */
export const uniqueEmails = (clients) => {
  const seen = new Set();
  const out = [];
  for (const c of clients) {
    for (const address of [...(c.emails || []), c.email]) {
      const value = String(address ?? '').trim();
      if (value && !seen.has(value.toLowerCase())) {
        seen.add(value.toLowerCase());
        out.push(value);
      }
    }
  }
  return out;
};

/** The wa.me link for a phone number as people type it, or '' when it is not a number WhatsApp can open. */
export const whatsappUrl = (phone) => {
  const n = whatsappNumber(phone);
  return n.ok ? `https://wa.me/${n.digits}` : '';
};
