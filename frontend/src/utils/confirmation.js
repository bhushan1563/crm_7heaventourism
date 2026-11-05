// Booking confirmations: the booking information added when a quotation is confirmed (travellers, payment, notes, additional
// details). Pure functions (no network, no React) so every rule can be tested. The server repeats these checks.

export const CONFIRMATION_LIMITS = { travellers: 50, name: 100, passport: 30, note: 200, maxAge: 120, customFields: 30, label: 60, value: 500, paymentNote: 300, supplier: 100, contactNumbers: 5, notes: 5000, reason: 300, hotels: 50, hotelNo: 60, hotelPhone: 40, maxAmount: 1_000_000_000 };

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const HOTEL_PHONE = /^[0-9+\-().\s]{5,40}$/;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/** What is still to be paid: always calculated from the two amounts, never typed. */
export const balanceOf = (payment) => round2((Number(payment?.totalAmount) || 0) - (Number(payment?.received) || 0));
export const isFullyPaid = (payment) => (Number(payment?.totalAmount) || 0) > 0 && (Number(payment?.received) || 0) >= (Number(payment?.totalAmount) || 0);

export const blankTraveller = () => ({ name: '', age: '', passportNo: '', notes: '' });
export const blankDetail = () => ({ label: '', value: '' });
export const blankHotelBooking = () => ({ confirmationNo: '', contactNumber: '', checkInTime: '', checkOutTime: '' });

/** The people the guests can call during the trip: the key each is kept under, and how it is named on screen and on the page. */
export const CONTACT_ROLES = [['coordinator', 'Tour coordinator'], ['emergency', 'Emergency contact']];

/** One contact as the form holds it: a name and a list of numbers (always at least one box, so there is a place to type). */
const contactForm = (c) => ({ name: c?.name || '', numbers: Array.isArray(c?.numbers) && c.numbers.length ? c.numbers.map((n) => String(n ?? '')) : [''] });
const contactsForm = (contacts) => Object.fromEntries(CONTACT_ROLES.map(([key]) => [key, contactForm(contacts?.[key])]));
const contactNumbersOf = (c) => (Array.isArray(c?.numbers) ? c.numbers : []).map((n) => String(n ?? '').trim()).filter(Boolean);
const contactsPayload = (contacts) => Object.fromEntries(CONTACT_ROLES.map(([key]) => [key, { name: String(contacts?.[key]?.name ?? '').trim(), numbers: contactNumbersOf(contacts?.[key]) }]));

/** The hotels of the copy of the quotation a booking was made from (the booking keeps one entry of details for each, in this order). */
export const hotelsOfQuote = (quote) => (Array.isArray(quote?.packageDetails?.hotels) ? quote.packageDetails.hotels : []);

/**
 * The details of each hotel as the form holds them: what was saved for it, and for a hotel with nothing saved yet what the hotel list
 * already said (its contact number and its usual check-in and check-out time), so there is little to type.
 */
export const hotelBookingsOf = (confirmation) =>
  hotelsOfQuote(confirmation?.quote).map((stay, i) => {
    const saved = confirmation?.hotelBookings?.[i];
    return saved
      ? { confirmationNo: saved.confirmationNo || '', contactNumber: saved.contactNumber || '', checkInTime: saved.checkInTime || '', checkOutTime: saved.checkOutTime || '' }
      : { confirmationNo: '', contactNumber: stay?.contactNumber || '', checkInTime: stay?.checkInTime || '', checkOutTime: stay?.checkOutTime || '' };
  });

/** A duration as people read it: a bare number ("7") is the nights, like the pricing tables take it; text such as "4 Nights / 5 Days" is kept. */
export const durationText = (duration) => {
  const text = String(duration ?? '').trim();
  if (!/^\d+$/.test(text)) return text;
  const n = Number(text);
  return `${n} ${n === 1 ? 'Night' : 'Nights'}`;
};

/** A stored date as the value of a date input (yyyy-mm-dd), or ''. */
export const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

/** The editable booking information of a confirmation, as the form holds it (text for every input). */
export const formFromConfirmation = (c) => ({
  travelDate: toDateInput(c?.travelDate),
  travellers: (c?.travellers || []).map((t) => ({ name: t.name || '', age: t.age ?? '', passportNo: t.passportNo || '', notes: t.notes || '' })),
  payment: { totalAmount: c?.payment?.totalAmount ?? 0, received: c?.payment?.received ?? 0, balanceDueDate: toDateInput(c?.payment?.balanceDueDate), supplier: c?.payment?.supplier || '', note: c?.payment?.note || '' },
  contacts: contactsForm(c?.contacts),
  showPricing: Boolean(c?.showPricing), // off unless the booking says so: the voucher usually carries no prices
  hotelBookings: hotelBookingsOf(c),
  notes: c?.notes || '',
  additionalServices: c?.additionalServices || '',
  importantNotes: c?.importantNotes || '',
  customFields: (c?.customFields || []).map((f) => ({ label: f.label || '', value: f.value || '' }))
});

/** The form as the server wants it. */
export const bookingPayload = (form) => ({
  travelDate: form.travelDate || '',
  travellers: form.travellers.map((t) => ({ name: t.name.trim(), age: t.age === '' || t.age === null ? null : Number(t.age), passportNo: t.passportNo.trim(), notes: t.notes.trim() })),
  payment: { totalAmount: Number(form.payment.totalAmount) || 0, received: Number(form.payment.received) || 0, balanceDueDate: form.payment.balanceDueDate || '', supplier: (form.payment.supplier || '').trim(), note: form.payment.note.trim() },
  contacts: contactsPayload(form.contacts),
  showPricing: Boolean(form.showPricing),
  hotelBookings: (form.hotelBookings || []).map((h) => ({ confirmationNo: h.confirmationNo.trim(), contactNumber: h.contactNumber.trim(), checkInTime: h.checkInTime, checkOutTime: h.checkOutTime })),
  notes: form.notes,
  additionalServices: form.additionalServices || '',
  importantNotes: form.importantNotes || '',
  customFields: form.customFields.map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
});

const isRealDate = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(text);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100;
};

/**
 * What stops the booking details from being saved, in plain words: an object keyed by the id of the field to fix (the first
 * message per field). Empty when everything is fine.
 */
export const bookingErrors = (form) => {
  const L = CONFIRMATION_LIMITS;
  const errors = {};
  const add = (key, message) => {
    if (!errors[key]) errors[key] = message;
  };

  if (form.travelDate && !isRealDate(form.travelDate)) add('travelDate', 'Please enter the travel date as a real date.');

  if (form.travellers.length > L.travellers) add('travellers', `A booking can list at most ${L.travellers} travellers.`);
  form.travellers.forEach((t, i) => {
    const n = i + 1;
    if (!t.name.trim()) add(`traveller-${i}-name`, `Please enter the name of traveller ${n}, or remove that line.`);
    else if (t.name.trim().length > L.name) add(`traveller-${i}-name`, `The name of traveller ${n} is too long (the limit is ${L.name} characters).`);
    if (t.age !== '' && t.age !== null) {
      const age = Number(t.age);
      if (!Number.isInteger(age) || age < 0 || age > L.maxAge) add(`traveller-${i}-age`, `The age of traveller ${n} must be a whole number from 0 to ${L.maxAge}.`);
    }
    if (t.passportNo.trim().length > L.passport) add(`traveller-${i}-passport`, `The passport number of traveller ${n} is too long (the limit is ${L.passport} characters).`);
  });

  const total = Number(form.payment.totalAmount);
  const received = Number(form.payment.received);
  if (!Number.isFinite(total) || total < 0 || total > L.maxAmount) add('payment-total', `The total amount must be an amount from 0 to ${rs(L.maxAmount)}.`);
  if (!Number.isFinite(received) || received < 0 || received > L.maxAmount) add('payment-received', `The amount received must be an amount from 0 to ${rs(L.maxAmount)}.`);
  if (!errors['payment-total'] && !errors['payment-received'] && round2(received) > round2(total)) {
    add('payment-received', `The amount received (${rs(received)}) cannot be more than the total amount (${rs(total)}).`);
  }
  if (form.payment.balanceDueDate && !isRealDate(form.payment.balanceDueDate)) add('payment-date', 'Please enter the balance due date as a real date.');

  for (const [key, label] of CONTACT_ROLES) {
    const person = form.contacts?.[key];
    if (!person) continue;
    const name = String(person.name ?? '').trim();
    if (name.length > L.name) add(`contact-${key}-name`, `The name of the ${label.toLowerCase()} is too long (the limit is ${L.name} characters).`);
    const numbers = contactNumbersOf(person);
    if (numbers.length > L.contactNumbers) add(`contact-${key}-numbers`, `The ${label.toLowerCase()} can have at most ${L.contactNumbers} numbers.`);
    (person.numbers || []).forEach((raw, i) => {
      const number = String(raw ?? '').trim();
      if (number && !HOTEL_PHONE.test(number)) add(`contact-${key}-number-${i}`, `Number ${i + 1} of the ${label.toLowerCase()} can only have digits, spaces and + - ( ) . characters (5 to ${L.hotelPhone} of them).`);
    });
  }

  (form.hotelBookings || []).forEach((h, i) => {
    const n = i + 1;
    if (h.confirmationNo.trim().length > L.hotelNo) add(`hotel-${i}-no`, `The confirmation number of hotel ${n} is too long (the limit is ${L.hotelNo} characters).`);
    if (h.contactNumber.trim() && !HOTEL_PHONE.test(h.contactNumber.trim())) add(`hotel-${i}-phone`, `The contact number of hotel ${n} can only have digits, spaces and + - ( ) . characters (5 to ${L.hotelPhone} of them).`);
    if (h.checkInTime && !TIME.test(h.checkInTime)) add(`hotel-${i}-in`, `The check-in time of hotel ${n} must be a time like 14:00.`);
    if (h.checkOutTime && !TIME.test(h.checkOutTime)) add(`hotel-${i}-out`, `The check-out time of hotel ${n} must be a time like 11:00.`);
  });

  const seen = new Map();
  form.customFields.forEach((f, i) => {
    const label = f.label.trim();
    if (!label) return add(`detail-${i}-label`, `Please enter a label for additional detail ${i + 1}, or remove that line.`);
    if (label.length > L.label) add(`detail-${i}-label`, `The label of additional detail ${i + 1} is too long (the limit is ${L.label} characters).`);
    if (f.value.trim().length > L.value) add(`detail-${i}-value`, `The value of additional detail ${i + 1} is too long (the limit is ${L.value} characters).`);
    const key = label.toLowerCase();
    if (seen.has(key)) add(`detail-${i}-label`, `The label "${label}" is already used by additional detail ${seen.get(key) + 1}. Please use each label once.`);
    else seen.set(key, i);
  });
  return errors;
};

/** The first field with an error, in the order the page shows them (for moving focus there). */
export const firstErrorKey = (errors, form) => {
  const order = ['travelDate', ...form.travellers.flatMap((_, i) => [`traveller-${i}-name`, `traveller-${i}-age`, `traveller-${i}-passport`]), ...(form.hotelBookings || []).flatMap((_, i) => [`hotel-${i}-no`, `hotel-${i}-phone`, `hotel-${i}-in`, `hotel-${i}-out`]), ...CONTACT_ROLES.flatMap(([key]) => [`contact-${key}-name`, ...(form.contacts?.[key]?.numbers || []).map((_, i) => `contact-${key}-number-${i}`), `contact-${key}-numbers`]), 'payment-total', 'payment-received', 'payment-date', ...form.customFields.flatMap((_, i) => [`detail-${i}-label`, `detail-${i}-value`])];
  return order.find((key) => errors[key]) || Object.keys(errors)[0] || null;
};

/**
 * The quotation as a confirmation prints it: the frozen copy, numbered with the confirmation number. It also carries
 * `confirmationInfo` (what the header says under the destination) and each hotel carries what the hotel gave (`bookingNo`, its
 * contact number and its times). The details are taken from `form` when there is one, so a preview shows what is on the screen.
 */
export const quotationOf = (confirmation, form) => {
  const quote = confirmation?.quote || {};
  const bookings = form?.hotelBookings || hotelBookingsOf(confirmation);
  const hotels = hotelsOfQuote(quote).map((stay, i) => {
    const b = bookings[i];
    return b ? { ...stay, bookingNo: b.confirmationNo, contactNumber: b.contactNumber, checkInTime: b.checkInTime, checkOutTime: b.checkOutTime } : stay;
  });
  // The travel date is the booking's own (it is edited on the confirmation page), not the one the quotation had when it was sold.
  const travelDate = form ? form.travelDate || '' : confirmation?.travelDate ?? quote.travelDate;
  return {
    ...quote,
    ...(quote.duration ? { duration: durationText(quote.duration) } : {}),
    travelDate,
    quotationNo: confirmation?.confirmationNo || quote.quotationNo || '',
    packageDetails: { ...(quote.packageDetails || {}), hotels },
    confirmationInfo: { no: confirmation?.confirmationNo || '', confirmedAt: confirmation?.confirmedAt || '', status: confirmation?.status || 'Confirmed', showPricing: form ? Boolean(form.showPricing) : Boolean(confirmation?.showPricing),
      // what the booking adds under "General Policy" on the last page
      additionalServices: (form ? form.additionalServices : confirmation?.additionalServices) || '',
      importantNotes: (form ? form.importantNotes : confirmation?.importantNotes) || '' }
  };
};

/** What the printed booking page shows: the saved confirmation with any unsaved edits on top, empty lines left out. */
export const bookingView = (confirmation, form) => {
  const f = form || formFromConfirmation(confirmation);
  const payment = { totalAmount: Number(f.payment.totalAmount) || 0, received: Number(f.payment.received) || 0, balanceDueDate: f.payment.balanceDueDate || '', note: f.payment.note || '' };
  return {
    travelDate: f.travelDate || '',
    travellers: f.travellers.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), age: t.age === '' || t.age === null ? null : Number(t.age), passportNo: t.passportNo.trim(), notes: t.notes.trim() })),
    payment: { ...payment, balance: balanceOf(payment) },
    showPricing: Boolean(f.showPricing),
    additionalServices: f.additionalServices || '',
    importantNotes: f.importantNotes || '',
    contacts: CONTACT_ROLES.map(([key, label]) => ({ key, label, name: String(f.contacts?.[key]?.name ?? '').trim(), numbers: contactNumbersOf(f.contacts?.[key]) })).filter((c) => c.name || c.numbers.length),
    notes: f.notes || '',
    customFields: f.customFields.filter((d) => d.label.trim()).map((d) => ({ label: d.label.trim(), value: d.value.trim() }))
  };
};

/** Why a quotation cannot be confirmed right now, in plain words, or null. */
export const confirmBlockedReason = (quotation) => {
  if (!quotation) return 'This quotation could not be found.';
  if (quotation.confirmationId) return `Already confirmed as ${quotation.confirmationNo || 'a booking'}.`;
  if (quotation.status === 'Cancelled' || quotation.status === 'Expired') return `This quotation is ${quotation.status.toLowerCase()}. Change its status before confirming it.`;
  return null;
};

/** True when confirming needs a choice: the quotation offers several hotel options. */
export const needsOptionChoice = (quotation) => (quotation?.options?.length || 0) > 0;
