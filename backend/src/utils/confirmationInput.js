import { line } from './itineraryInput.js';
import { richToText, sanitizeRich } from './richText.js';

// The booking information of a confirmation: travellers, payment, notes and the free-form "Additional details". Pure logic (no
// database), so it can be tested exhaustively. Every problem comes back as a message in plain words that names the line.

export const CONFIRMATION_LIMITS = {
  travellers: 50,
  name: 100,
  passport: 30,
  travellerNote: 200,
  maxAge: 120,
  customFields: 30,
  label: 60,
  value: 500,
  paymentNote: 300,
  notes: 5000,
  reason: 300,
  maxAmount: 1_000_000_000
};

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;
const rs = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;
const blank = (v) => v === undefined || v === null || v === '';

/** What is still to be paid. Always calculated, never typed or stored, so it can never disagree with the two amounts. */
export const balanceOf = (payment) => round2((Number(payment?.totalAmount) || 0) - (Number(payment?.received) || 0));

/** True once something is due and all of it has been received. */
export const isFullyPaid = (payment) => (Number(payment?.totalAmount) || 0) > 0 && (Number(payment?.received) || 0) >= (Number(payment?.totalAmount) || 0);

/** A date typed as 2027-03-15 (or a full ISO date): a real day in a sensible range, or empty. */
const dateInput = (value, label) => {
  if (blank(value)) return { ok: true, value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/.test(value.trim())) return fail(`Please enter ${label} as a date, for example 2027-03-15.`);
  const typed = value.trim();
  const date = new Date(typed);
  const year = date.getUTCFullYear();
  // JavaScript quietly rolls 2027-02-31 over to March 3: a day that does not survive the round trip is not a real day.
  if (Number.isNaN(date.getTime()) || year < 2000 || year > 2100 || date.toISOString().slice(0, 10) !== typed.slice(0, 10)) {
    return fail(`${label[0].toUpperCase()}${label.slice(1)} is not a real date.`);
  }
  return { ok: true, value: date };
};

const amountInput = (value, label) => {
  if (blank(value)) return { ok: true, value: 0 };
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > CONFIRMATION_LIMITS.maxAmount) return fail(`${label[0].toUpperCase()}${label.slice(1)} must be an amount from 0 to ${rs(CONFIRMATION_LIMITS.maxAmount)}.`);
  return { ok: true, value: round2(n) };
};

/**
 * @param {object} body what the client sent; only the keys present are checked and returned
 * @param {{ payment?: object }} [current] what is stored now: a payment update that sends only some of its fields keeps the rest
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export const normalizeBookingInput = (body, current = {}) => {
  const L = CONFIRMATION_LIMITS;
  const data = {};

  if (body.travelDate !== undefined) {
    const r = dateInput(body.travelDate, 'the travel date');
    if (!r.ok) return r;
    data.travelDate = r.value;
  }

  // The client's contact details: the Send window keeps a WhatsApp number or an e-mail address typed there. Empty clears it.
  if (body.clientPhone !== undefined) {
    const r = line(body.clientPhone, "the client's phone number", 30);
    if (!r.ok) return r;
    if (r.value && !/^\+?[0-9][0-9 ().-]{4,28}$/.test(r.value)) return fail('The client\'s phone number can only have digits, spaces, "+" and "-".');
    data.clientPhone = r.value;
  }
  if (body.clientEmail !== undefined) {
    const r = line(body.clientEmail, "the client's e-mail address", 254);
    if (!r.ok) return r;
    if (r.value && !/^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(r.value)) return fail("The client's e-mail address does not look right. It should be like name@example.com.");
    data.clientEmail = r.value;
  }

  if (body.travellers !== undefined) {
    if (!Array.isArray(body.travellers)) return fail('The travellers must be a list.');
    if (body.travellers.length > L.travellers) return fail(`A booking can list at most ${L.travellers} travellers (there are ${body.travellers.length}).`);
    const travellers = [];
    for (const [index, raw] of body.travellers.entries()) {
      const n = index + 1;
      if (!isPlainObject(raw)) return fail(`Traveller ${n} is not valid.`);
      const name = line(raw.name, `the name of traveller ${n}`, L.name, { required: true });
      if (!name.ok) return name;
      let age = null;
      if (!blank(raw.age)) {
        const value = typeof raw.age === 'number' || typeof raw.age === 'string' ? Number(raw.age) : Number.NaN;
        if (!Number.isInteger(value) || value < 0 || value > L.maxAge) return fail(`The age of traveller ${n} must be a whole number from 0 to ${L.maxAge}.`);
        age = value;
      }
      const passportNo = line(raw.passportNo, `the passport number of traveller ${n}`, L.passport);
      if (!passportNo.ok) return passportNo;
      const notes = line(raw.notes, `the note for traveller ${n}`, L.travellerNote);
      if (!notes.ok) return notes;
      travellers.push({ name: name.value, age, passportNo: passportNo.value, notes: notes.value });
    }
    data.travellers = travellers;
  }

  if (body.payment !== undefined) {
    if (!isPlainObject(body.payment)) return fail('The payment details must be a set of fields.');
    const p = body.payment;
    const stored = current.payment || {};
    const payment = { totalAmount: Number(stored.totalAmount) || 0, received: Number(stored.received) || 0, balanceDueDate: stored.balanceDueDate ?? null, note: stored.note || '' };
    if (p.totalAmount !== undefined) {
      const r = amountInput(p.totalAmount, 'the total amount');
      if (!r.ok) return r;
      payment.totalAmount = r.value;
    }
    if (p.received !== undefined) {
      const r = amountInput(p.received, 'the amount received');
      if (!r.ok) return r;
      payment.received = r.value;
    }
    if (p.balanceDueDate !== undefined) {
      const r = dateInput(p.balanceDueDate, 'the balance due date');
      if (!r.ok) return r;
      payment.balanceDueDate = r.value;
    }
    if (p.note !== undefined) {
      const r = line(p.note, 'the payment note', L.paymentNote);
      if (!r.ok) return r;
      payment.note = r.value;
    }
    if (payment.received > payment.totalAmount) return fail(`The amount received (${rs(payment.received)}) cannot be more than the total amount (${rs(payment.totalAmount)}).`);
    data.payment = payment;
  }

  if (body.notes !== undefined) {
    const r = sanitizeRich(body.notes, { label: 'The notes', maxText: L.notes });
    if (!r.ok) return r;
    data.notes = richToText(r.value).trim() ? r.value : '';
  }

  if (body.customFields !== undefined) {
    if (!Array.isArray(body.customFields)) return fail('The additional details must be a list.');
    if (body.customFields.length > L.customFields) return fail(`There can be at most ${L.customFields} additional details (there are ${body.customFields.length}).`);
    const fields = [];
    const seen = new Set();
    for (const [index, raw] of body.customFields.entries()) {
      const n = index + 1;
      if (!isPlainObject(raw)) return fail(`Additional detail ${n} is not valid.`);
      const label = line(raw.label, `a label for additional detail ${n}`, L.label, { required: true });
      if (!label.ok) return label;
      const value = line(raw.value, `the value of additional detail ${n}`, L.value);
      if (!value.ok) return value;
      const key = label.value.toLowerCase();
      if (seen.has(key)) return fail(`The label "${label.value}" is used twice in the additional details. Please use each label once.`);
      seen.add(key);
      fields.push({ label: label.value, value: value.value });
    }
    data.customFields = fields;
  }

  return { ok: true, data };
};

/** Why a booking is being cancelled: required, one line. */
export const normalizeCancelReason = (value) => line(value, 'a reason for cancelling', CONFIRMATION_LIMITS.reason, { required: true });
