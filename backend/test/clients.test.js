import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { clientsFrom } from '../src/utils/clientDirectory.js';
import { CLIENT_LIMITS, normalizeFutureClient } from '../src/utils/clientInput.js';

const guest = (over) => ({ _id: `g${Math.random()}`, guestNames: 'Aarav Mehta', email: '', contactNumber: '', destination: 'Goa', travelDate: new Date('2027-01-10'), status: 'Quoted', sales: 'Sana', createdAt: new Date('2026-10-01'), ...over });
const booking = (over) => ({ _id: `c${Math.random()}`, clientName: 'Aarav Mehta', clientEmail: '', clientPhone: '', destination: 'Rajasthan', travelDate: new Date('2027-04-10'), status: 'Confirmed', sales: 'Sana', createdAt: new Date('2026-11-01'), ...over });

test('one person who made several inquiries and a booking is one client, found by e-mail or by the end of the phone number', () => {
  const list = clientsFrom({
    guests: [
      guest({ _id: 'g1', email: 'Aarav@Example.com', contactNumber: '+91 98765 43210' }),
      guest({ _id: 'g2', guestNames: 'Aarav M.', contactNumber: '098765-43210', destination: 'Kerala', travelDate: new Date('2027-02-01'), createdAt: new Date('2026-10-05') }),
      guest({ _id: 'g3', guestNames: 'Someone Else', contactNumber: '90000 11111' })
    ],
    confirmations: [booking({ _id: 'c1', clientEmail: 'aarav@example.com', clientPhone: '' })]
  });
  assert.equal(list.length, 2);
  const aarav = list.find((c) => c.emails.length);
  assert.deepEqual(aarav.emails, ['Aarav@Example.com']);
  assert.deepEqual(aarav.phones, ['+91 98765 43210']);
  assert.equal(aarav.inquiries, 2);
  assert.equal(aarav.bookings, 1);
  assert.equal(aarav.destination, 'Rajasthan'); // the latest trip
  assert.equal(aarav.travelDate, '2027-04-10');
  assert.equal(aarav.confirmationId, 'c1');
  assert.equal(aarav.guestId, 'g2'); // the most recent inquiry is the one to open
});

test('a booking that was cancelled is not counted, and a record with nothing to identify it is left out', () => {
  const list = clientsFrom({
    guests: [guest({ guestNames: '', email: '', contactNumber: '' })],
    confirmations: [booking({ clientEmail: 'x@y.com', status: 'Cancelled' }), booking({ clientEmail: 'x@y.com', status: 'Confirmed' })]
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].bookings, 1);
});

test('two people who only share a first name stay apart, and records joined later by a shared number merge', () => {
  const apart = clientsFrom({ guests: [guest({ guestNames: 'Ravi', contactNumber: '90000 11111' }), guest({ guestNames: 'Ravi', contactNumber: '80000 22222' })] });
  assert.equal(apart.length, 2);
  const merged = clientsFrom({ guests: [guest({ email: 'a@b.com' }), guest({ contactNumber: '90000 11111' }), guest({ email: 'a@b.com', contactNumber: '90000 11111' })] });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].inquiries, 3);
});

test('the clients come out by name, and nothing at all gives an empty list', () => {
  const list = clientsFrom({ guests: [guest({ guestNames: 'Zoya', email: 'z@z.com' }), guest({ guestNames: 'anil', email: 'a@a.com' }), guest({ guestNames: 'Bhavna', email: 'b@b.com' })] });
  assert.deepEqual(list.map((c) => c.name), ['anil', 'Bhavna', 'Zoya']);
  assert.deepEqual(clientsFrom(), []);
});

test('a future client needs a name; everything else is optional and tidied', () => {
  const r = normalizeFutureClient({ name: '  Meera   Joshi ', phone: ' +91 98765 43210 ', email: 'meera@example.com', destination: 'Bali', expectedTravel: 'December 2026', budget: '2 lakh', source: 'Instagram', notes: 'Honeymoon' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { name: 'Meera Joshi', phone: '+91 98765 43210', email: 'meera@example.com', destination: 'Bali', expectedTravel: 'December 2026', budget: '2 lakh', source: 'Instagram', notes: 'Honeymoon' });
  assert.equal(normalizeFutureClient({ name: 'Only a name' }).ok, true);
});

test('future client problems are said in plain words', () => {
  const bad = (body, options) => {
    const r = normalizeFutureClient(body, options);
    assert.equal(r.ok, false);
    return r.message;
  };
  assert.equal(bad({}), 'Please enter the name of the client.');
  assert.equal(bad({ name: '  ' }), 'Please enter the name of the client.');
  assert.match(bad({ name: 'A', phone: 'call me' }), /phone number can only have digits/);
  assert.match(bad({ name: 'A', email: 'nope' }), /e-mail address does not look right/);
  assert.match(bad({ name: 'x'.repeat(CLIENT_LIMITS.name + 1) }), /too long/);
  assert.match(bad({ name: 'A', notes: 5 }), /must be text/);
  assert.equal(bad('Meera'), 'The client details must be a set of fields.');
  assert.equal(bad(null), 'The client details must be a set of fields.');
});

test('an update checks only what it sends', () => {
  assert.deepEqual(normalizeFutureClient({ phone: '98765 43210' }, { partial: true }), { ok: true, data: { phone: '98765 43210' } });
  assert.equal(normalizeFutureClient({ name: ' ' }, { partial: true }).ok, false);
  assert.deepEqual(normalizeFutureClient({}, { partial: true }), { ok: true, data: {} });
});
