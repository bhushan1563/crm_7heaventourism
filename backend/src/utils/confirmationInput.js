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
  supplier: 100,
  contactNumbers: 5,
  notes: 5000,
  reason: 300,
  hotels: 50,
  hotelNo: 60,
  hotelPhone: 40,
  maxAmount: 1_000_000_000
};

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const HOTEL_PHONE = /^[0-9+\-().\s]{5,40}$/;

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
    const payment = { totalAmount: Number(stored.totalAmount) || 0, received: Number(stored.received) || 0, balanceDueDate: stored.balanceDueDate ?? null, supplier: stored.supplier || '', note: stored.note || '' };
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
    if (p.supplier !== undefined) {
      const r = line(p.supplier, 'the supplier name', L.supplier);
      if (!r.ok) return r;
      payment.supplier = r.value;
    }
    if (p.note !== undefined) {
      const r = line(p.note, 'the payment note', L.paymentNote);
      if (!r.ok) return r;
      payment.note = r.value;
    }
    if (payment.received > payment.totalAmount) return fail(`The amount received (${rs(payment.received)}) cannot be more than the total amount (${rs(payment.totalAmount)}).`);
    data.payment = payment;
  }

  // The people to call during the trip: the tour coordinator and the emergency contact, each a name and up to a few numbers.
  // A person that is not sent keeps what is stored; blank numbers are dropped.
  if (body.contacts !== undefined) {
    if (!isPlainObject(body.contacts)) return fail('The contact details must be a set of fields.');
    const stored = current.contacts || {};
    const contacts = {};
    for (const [key, label] of [['coordinator', 'tour coordinator'], ['emergency', 'emergency contact']]) {
      const kept = stored[key] || {};
      const entry = { name: kept.name || '', numbers: [...(kept.numbers || [])] };
      const raw = body.contacts[key];
      if (raw !== undefined) {
        if (!isPlainObject(raw)) return fail(`The details of the ${label} are not valid.`);
        if (raw.name !== undefined) {
          const r = line(raw.name, `the name of the ${label}`, L.name);
          if (!r.ok) return r;
          entry.name = r.value;
        }
        if (raw.numbers !== undefined) {
          if (!Array.isArray(raw.numbers)) return fail(`The numbers of the ${label} must be a list.`);
          if (raw.numbers.length > L.contactNumbers * 4) return fail(`The ${label} can have at most ${L.contactNumbers} numbers.`);
          const numbers = [];
          for (const [index, item] of raw.numbers.entries()) {
            const r = line(item, `number ${index + 1} of the ${label}`, L.hotelPhone);
            if (!r.ok) return r;
            if (!r.value) continue;
            if (!HOTEL_PHONE.test(r.value)) return fail(`Number ${index + 1} of the ${label} can only have digits, spaces and + - ( ) . characters (5 to ${L.hotelPhone} of them).`);
            numbers.push(r.value);
          }
          if (numbers.length > L.contactNumbers) return fail(`The ${label} can have at most ${L.contactNumbers} numbers (there are ${numbers.length}).`);
          entry.numbers = numbers;
        }
      }
      contacts[key] = entry;
    }
    data.contacts = contacts;
  }

  // What each hotel gave once the room was booked (the hotel's own confirmation number, its contact number and the times), in the
  // order of the hotels of the copy of the quotation.
  if (body.hotelBookings !== undefined) {
    if (!Array.isArray(body.hotelBookings)) return fail('The hotel booking details must be a list.');
    if (body.hotelBookings.length > L.hotels) return fail(`A booking can have details for at most ${L.hotels} hotels (there are ${body.hotelBookings.length}).`);
    const hotels = [];
    for (const [index, raw] of body.hotelBookings.entries()) {
      const n = index + 1;
      if (!isPlainObject(raw)) return fail(`The booking details of hotel ${n} are not valid.`);
      const confirmationNo = line(raw.confirmationNo, `the confirmation number of hotel ${n}`, L.hotelNo);
      if (!confirmationNo.ok) return confirmationNo;
      const contactNumber = line(raw.contactNumber, `the contact number of hotel ${n}`, L.hotelPhone);
      if (!contactNumber.ok) return contactNumber;
      if (contactNumber.value && !HOTEL_PHONE.test(contactNumber.value)) return fail(`The contact number of hotel ${n} can only have digits, spaces and + - ( ) . characters (5 to ${L.hotelPhone} of them).`);
      const times = {};
      for (const [key, label] of [['checkInTime', 'check-in time'], ['checkOutTime', 'check-out time']]) {
        const time = blank(raw[key]) ? '' : raw[key];
        if (time !== '' && (typeof time !== 'string' || !TIME.test(time))) return fail(`The ${label} of hotel ${n} must be a time like 14:00.`);
        times[key] = time;
      }
      hotels.push({ confirmationNo: confirmationNo.value, contactNumber: contactNumber.value, ...times });
    }
    data.hotelBookings = hotels;
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
