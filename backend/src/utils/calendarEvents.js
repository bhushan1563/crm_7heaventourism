// The travel calendar's events: every guest inquiry, quotation and booking that has a travel date, as a day or a run of days.
// Pure functions, so every rule can be tested without a database.

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_RANGE_DAYS = 400;
export const MAX_NIGHTS = 120;

export const isIsoDate = (value) => typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const toIso = (date) => (date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '');

export const addDaysIso = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export const daysBetween = (fromIso, toIsoDate) => Math.round((Date.parse(`${toIsoDate}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);

/** The nights of a trip from the text it was typed as: "7 Nights / 8 Days", "3N/4D", "6N", "7". Nothing readable means a single day. */
export const nightsOf = (duration) => {
  const m = String(duration ?? '').match(/\d+/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_NIGHTS) : 0;
};

const text = (v) => String(v ?? '').trim();

/**
 * One calendar event from a record. `kind` is 'guest' (an inquiry), 'quotation' or 'confirmation' (a booking).
 * Returns null when the record has no usable travel date.
 */
export const eventOf = (kind, doc) => {
  const start = toIso(doc.travelDate);
  if (!start) return null;
  const nights = kind === 'guest' ? 0 : nightsOf(doc.duration);
  const id = String(doc._id);
  const base = { id: `${kind}:${id}`, kind, recordId: id, start, end: nights ? addDaysIso(start, nights) : start, nights, destination: text(doc.destination), status: text(doc.status), sales: text(doc.sales), ops: text(doc.ops) };
  if (kind === 'guest') return { ...base, title: text(doc.guestNames) || 'Guest', ref: text(doc.srNo), pax: doc.paxCount ? `${doc.paxCount} guests` : '', link: '/guests' };
  if (kind === 'quotation') return { ...base, title: text(doc.clientName) || 'Quotation', ref: text(doc.quotationNo), pax: text(doc.paxDetails), type: text(doc.quotationType), link: `/quotations/${id}/edit` };
  return { ...base, title: text(doc.clientName) || 'Booking', ref: text(doc.confirmationNo), pax: text(doc.paxDetails), type: text(doc.quotationType), link: `/confirmations/${id}` };
};

/**
 * The payment deadline of a booking: the day its balance is due, while something is still owed. `balance` is what is left to pay.
 * Returns null for a cancelled or fully paid booking, or one with no due date.
 */
export const paymentEventOf = (doc, balance) => {
  const due = toIso(doc.payment?.balanceDueDate);
  if (!due || doc.status === 'Cancelled' || !(Number(balance) > 0)) return null;
  const id = String(doc._id);
  const amount = `Rs ${Number(balance).toLocaleString('en-IN')}`;
  return {
    id: `payment:${id}`, kind: 'payment', recordId: id, start: due, end: due, nights: 0, title: text(doc.clientName) || 'Booking', ref: text(doc.confirmationNo),
    destination: text(doc.destination), status: 'Payment due', amount, supplier: text(doc.payment?.supplier), travelStart: toIso(doc.travelDate), sales: text(doc.sales), ops: text(doc.ops), pax: text(doc.paxDetails), link: `/confirmations/${id}`
  };
};

/** Does the event touch any day of from..to (inclusive)? */
export const overlaps = (event, from, to) => event.end >= from && event.start <= to;

/** The oldest travel date worth reading for a range: trips that began a little before it can still be running. */
export const lookBackFrom = (from) => addDaysIso(from, -MAX_NIGHTS);

/** Checks the query. Returns { ok: true, from, to } or { ok: false, message }. */
export const rangeOf = (query = {}) => {
  const from = typeof query.from === 'string' ? query.from : '';
  const to = typeof query.to === 'string' ? query.to : '';
  if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, message: 'Give the dates as from=YYYY-MM-DD and to=YYYY-MM-DD.' };
  if (to < from) return { ok: false, message: 'The end of the range is before its start.' };
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return { ok: false, message: `Please ask for at most ${MAX_RANGE_DAYS} days at a time.` };
  return { ok: true, from, to };
};
