import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { addDaysIso, daysBetween, eventOf, isIsoDate, nightsOf, overlaps, paymentEventOf, rangeOf } from '../src/utils/calendarEvents.js';

test('nightsOf reads the ways a duration is typed, and a trip with none is one day', () => {
  assert.equal(nightsOf('7 Nights / 8 Days'), 7);
  assert.equal(nightsOf('3N/4D'), 3);
  assert.equal(nightsOf('8 Nights/9 Days'), 8);
  assert.equal(nightsOf('6N'), 6);
  assert.equal(nightsOf('7'), 7);
  assert.equal(nightsOf('1 Night'), 1);
  for (const none of ['', null, undefined, 'Flexible', '0', 'abc']) assert.equal(nightsOf(none), 0, String(none));
  assert.equal(nightsOf('99999 nights'), 120, 'a typing mistake cannot paint the calendar for centuries');
});

test('an event spans the travel date plus the nights, and a guest inquiry is its one day', () => {
  const q = eventOf('quotation', { _id: 'q1', travelDate: new Date('2026-11-10'), duration: '3 Nights / 4 Days', clientName: ' Nihar ', quotationNo: '7H-QT-1', destination: 'Andaman', status: 'Draft' });
  assert.deepEqual([q.start, q.end, q.nights, q.title, q.link, q.id], ['2026-11-10', '2026-11-13', 3, 'Nihar', '/quotations/q1/edit', 'quotation:q1']);
  const g = eventOf('guest', { _id: 'g1', travelDate: new Date('2026-11-10'), duration: '9 Nights', guestNames: 'Aarav', srNo: 'G-1', paxCount: 2 });
  assert.deepEqual([g.start, g.end, g.nights, g.pax], ['2026-11-10', '2026-11-10', 0, '2 guests']);
  const c = eventOf('confirmation', { _id: 'c1', travelDate: new Date('2027-03-21'), duration: '7', clientName: 'Pujan', confirmationNo: '7H-CF-1' });
  assert.deepEqual([c.start, c.end, c.link], ['2027-03-21', '2027-03-28', '/confirmations/c1']);
});

test('a record with no travel date has no event', () => {
  assert.equal(eventOf('quotation', { _id: 'x', travelDate: null }), null);
  assert.equal(eventOf('guest', { _id: 'x', travelDate: new Date('nope') }), null);
});

test('date helpers cross month and year ends and leap days', () => {
  assert.equal(addDaysIso('2026-12-30', 3), '2027-01-02');
  assert.equal(addDaysIso('2028-02-28', 1), '2028-02-29');
  assert.equal(daysBetween('2026-01-01', '2027-01-01'), 365);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-2-3'), false);
  assert.equal(isIsoDate('2026-11-04'), true);
});

test('rangeOf asks for real dates, in order, and not too many', () => {
  assert.deepEqual(rangeOf({ from: '2026-11-01', to: '2026-11-30' }), { ok: true, from: '2026-11-01', to: '2026-11-30' });
  for (const bad of [{}, { from: '2026-11-01' }, { from: 'x', to: 'y' }, { from: '2026-11-30', to: '2026-11-01' }, { from: '2026-01-01', to: '2028-01-01' }, { from: ['2026-11-01'], to: '2026-11-02' }]) assert.equal(rangeOf(bad).ok, false, JSON.stringify(bad));
});

test('property: overlaps is true exactly when the event shares a day with the range', () => {
  const day = fc.integer({ min: 0, max: 400 }).map((n) => addDaysIso('2026-01-01', n));
  fc.assert(fc.property(day, fc.integer({ min: 0, max: 30 }), day, fc.integer({ min: 0, max: 30 }), (s, len, f, span) => {
    const event = { start: s, end: addDaysIso(s, len) };
    const to = addDaysIso(f, span);
    const shared = [...Array(len + 1).keys()].some((i) => addDaysIso(s, i) >= f && addDaysIso(s, i) <= to);
    assert.equal(overlaps(event, f, to), shared);
  }));
});

test('a booking that still owes money has a payment deadline on its balance due date, and nothing else has', () => {
  const doc = { _id: 'c1', clientName: 'Pujan', confirmationNo: '7H-CF-1', destination: 'Vietnam', status: 'Confirmed', travelDate: new Date('2027-03-21'), payment: { totalAmount: 757200, received: 200000, balanceDueDate: new Date('2027-02-15') } };
  const e = paymentEventOf(doc, 557200);
  assert.deepEqual([e.kind, e.start, e.end, e.title, e.amount, e.status, e.travelStart, e.link], ['payment', '2027-02-15', '2027-02-15', 'Pujan', 'Rs 5,57,200', 'Payment due', '2027-03-21', '/confirmations/c1']);
  assert.equal(paymentEventOf(doc, 0), null, 'fully paid');
  assert.equal(paymentEventOf({ ...doc, status: 'Cancelled' }, 100), null, 'cancelled');
  assert.equal(paymentEventOf({ ...doc, payment: { totalAmount: 5, received: 0 } }, 5), null, 'no due date');
});
