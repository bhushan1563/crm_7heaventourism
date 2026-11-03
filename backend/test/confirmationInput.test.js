import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { CONFIRMATION_LIMITS as L, balanceOf, isFullyPaid, normalizeBookingInput, normalizeCancelReason } from '../src/utils/confirmationInput.js';
import { confirmationFromQuotation } from '../src/utils/confirmationSnapshot.js';

const ok = (body, current) => {
  const r = normalizeBookingInput(body, current);
  assert.equal(r.ok, true, r.message);
  return r.data;
};
const bad = (body, current) => {
  const r = normalizeBookingInput(body, current);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('a request that carries none of the booking fields changes nothing', () => {
  assert.deepEqual(ok({ status: 'Cancelled', quote: { destination: 'x' }, confirmationNo: 'hacked' }), {});
});

test('travellers are tidied; age and passport are optional', () => {
  const d = ok({ travellers: [{ name: '  Aarav   Mehta ', age: '41', passportNo: ' Z1234567 ', notes: 'Vegetarian' }, { name: 'Anaya' }] });
  assert.deepEqual(d.travellers, [{ name: 'Aarav Mehta', age: 41, passportNo: 'Z1234567', notes: 'Vegetarian' }, { name: 'Anaya', age: null, passportNo: '', notes: '' }]);
  assert.deepEqual(ok({ travellers: [] }).travellers, []);
});

test('traveller problems name the traveller', () => {
  assert.equal(bad({ travellers: [{ name: 'A' }, { name: '  ' }] }), 'Please enter the name of traveller 2.');
  assert.match(bad({ travellers: [{ name: 'A', age: -1 }] }), /age of traveller 1 must be a whole number from 0 to 120/);
  assert.match(bad({ travellers: [{ name: 'A', age: 4.5 }] }), /age of traveller 1/);
  assert.match(bad({ travellers: [{ name: 'A', age: 'old' }] }), /age of traveller 1/);
  assert.match(bad({ travellers: [{ name: 'A', age: 121 }] }), /age of traveller 1/);
  assert.match(bad({ travellers: [{ name: 'A', passportNo: 'x'.repeat(L.passport + 1) }] }), /passport number of traveller 1 is too long/i);
  assert.equal(bad({ travellers: 'Aarav' }), 'The travellers must be a list.');
  assert.match(bad({ travellers: ['Aarav'] }), /^Traveller 1 is not valid\./);
  assert.match(bad({ travellers: Array.from({ length: L.travellers + 1 }, () => ({ name: 'A' })) }), /at most 50 travellers \(there are 51\)/);
});

test('payment: amounts are rounded, the balance is calculated, and what is not sent is kept', () => {
  const d = ok({ payment: { totalAmount: '50000.456', received: 20000, balanceDueDate: '2027-03-01', note: ' Cheque ' } });
  assert.deepEqual([d.payment.totalAmount, d.payment.received, d.payment.note], [50000.46, 20000, 'Cheque']);
  assert.equal(d.payment.balanceDueDate.toISOString().slice(0, 10), '2027-03-01');
  assert.equal(balanceOf(d.payment), 30000.46);

  const kept = ok({ payment: { received: 10000 } }, { payment: { totalAmount: 30000, received: 0, balanceDueDate: new Date('2027-01-05'), note: 'Advance' } });
  assert.deepEqual([kept.payment.totalAmount, kept.payment.received, kept.payment.note], [30000, 10000, 'Advance']);
  assert.equal(kept.payment.balanceDueDate.toISOString().slice(0, 10), '2027-01-05');
  assert.equal(ok({ payment: { balanceDueDate: '' } }, { payment: { totalAmount: 1, balanceDueDate: new Date('2027-01-05') } }).payment.balanceDueDate, null, 'an emptied date is a real change');
});

test('payment problems are explained in plain words', () => {
  assert.equal(bad({ payment: { totalAmount: 1000, received: 1500 } }), 'The amount received (Rs 1,500) cannot be more than the total amount (Rs 1,000).');
  assert.match(bad({ payment: { received: 100 } }, { payment: { totalAmount: 50 } }), /cannot be more than the total amount \(Rs 50\)/);
  assert.match(bad({ payment: { totalAmount: -5 } }), /total amount must be an amount from 0 to Rs 1,00,00,00,000/);
  assert.match(bad({ payment: { totalAmount: 'lots' } }), /total amount must be an amount/);
  assert.match(bad({ payment: { totalAmount: { $gt: 0 } } }), /total amount must be an amount/);
  assert.match(bad({ payment: { totalAmount: 5e12 } }), /total amount/);
  assert.match(bad({ payment: { totalAmount: 100, balanceDueDate: 'next week' } }), /Please enter the balance due date as a date, for example 2027-03-15/);
  assert.match(bad({ payment: { totalAmount: 100, balanceDueDate: '1850-01-01' } }), /not a real date/);
  assert.match(bad({ payment: { totalAmount: 100, balanceDueDate: '2027-02-31' } }), /balance due date is not a real date/, 'a day that does not exist is refused, not rolled over to March');
  assert.match(bad({ travelDate: '2027-13-01' }), /travel date is not a real date/);
  assert.equal(ok({ travelDate: '2028-02-29' }).travelDate.toISOString().slice(0, 10), '2028-02-29', 'a real leap day is fine');
  assert.match(bad({ travelDate: '2027-02-29' }), /not a real date/);
  assert.equal(bad({ payment: 'paid' }), 'The payment details must be a set of fields.');
  assert.match(bad({ payment: { note: 'x'.repeat(L.paymentNote + 1) } }), /payment note is too long/i);
});

test('the travel date is a real date or empty', () => {
  assert.equal(ok({ travelDate: '2027-04-10' }).travelDate.toISOString().slice(0, 10), '2027-04-10');
  assert.equal(ok({ travelDate: '' }).travelDate, null);
  assert.equal(ok({ travelDate: null }).travelDate, null);
  assert.match(bad({ travelDate: 'soon' }), /Please enter the travel date as a date/);
  assert.match(bad({ travelDate: 20270410 }), /travel date/);
});

test('notes: formatting is kept, markup that is not allowed is removed, empty becomes empty', () => {
  assert.equal(ok({ notes: '<p onclick="x()"><strong>Window seat</strong></p><script>alert(1)</script>' }).notes, '<p><strong>Window seat</strong></p>');
  assert.equal(ok({ notes: 'Plain <b>text</b>' }).notes, 'Plain <b>text</b>', 'text that is not formatted is kept as typed');
  assert.equal(ok({ notes: '<p></p>' }).notes, '');
  assert.match(bad({ notes: 'x'.repeat(L.notes + 1) }), /notes is too long/i);
  assert.match(bad({ notes: 42 }), /notes must be text/i);
});

test('additional details: label + value pairs, each label once', () => {
  const d = ok({ customFields: [{ label: ' Hotel   voucher no ', value: 'HV-7781' }, { label: 'Driver', value: '' }, { label: 'Pickup' }] });
  assert.deepEqual(d.customFields, [{ label: 'Hotel voucher no', value: 'HV-7781' }, { label: 'Driver', value: '' }, { label: 'Pickup', value: '' }]);
  assert.equal(bad({ customFields: [{ label: 'Driver', value: 'a' }, { label: 'DRIVER', value: 'b' }] }), 'The label "DRIVER" is used twice in the additional details. Please use each label once.');
  assert.equal(bad({ customFields: [{ label: '', value: 'x' }] }), 'Please enter a label for additional detail 1.');
  assert.match(bad({ customFields: [{ label: 'A', value: 'x'.repeat(L.value + 1) }] }), /value of additional detail 1 is too long/i);
  assert.equal(bad({ customFields: 'x' }), 'The additional details must be a list.');
  assert.match(bad({ customFields: Array.from({ length: L.customFields + 1 }, (_, i) => ({ label: `L${i}` })) }), /at most 30 additional details/);
});

test('a reason is needed to cancel', () => {
  assert.equal(normalizeCancelReason('  Client changed plans ').value, 'Client changed plans');
  assert.equal(normalizeCancelReason('').message, 'Please enter a reason for cancelling.');
  assert.equal(normalizeCancelReason(undefined).message, 'Please enter a reason for cancelling.');
  assert.match(normalizeCancelReason('x'.repeat(L.reason + 1)).message, /too long/i);
  assert.equal(normalizeCancelReason(['a']).ok, false);
});

test('isFullyPaid only when something is due and all of it is received', () => {
  assert.equal(isFullyPaid({ totalAmount: 100, received: 100 }), true);
  assert.equal(isFullyPaid({ totalAmount: 100, received: 99.99 }), false);
  assert.equal(isFullyPaid({ totalAmount: 0, received: 0 }), false, 'nothing due is not "paid"');
  assert.equal(isFullyPaid(undefined), false);
});

test('property: whatever arrives, the answer is a clear message or data that obeys every limit; cleaning twice changes nothing', () => {
  const text = fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom('<script>x</script>', '\u0000', 'x'.repeat(700), '2027-02-30', '2027-03-15', ''), fc.integer({ min: -5, max: 500 }), fc.double({ noNaN: true, min: -10, max: 1e10 }), fc.constant(null));
  const traveller = fc.record({ name: text, age: text, passportNo: text, notes: text }, { requiredKeys: [] });
  const field = fc.record({ label: text, value: text }, { requiredKeys: [] });
  const payment = fc.record({ totalAmount: text, received: text, balanceDueDate: text, note: text }, { requiredKeys: [] });
  fc.assert(
    fc.property(
      fc.record({ travellers: fc.oneof(text, fc.array(traveller, { maxLength: 4 })), payment: fc.oneof(text, payment), customFields: fc.oneof(text, fc.array(field, { maxLength: 4 })), notes: text, travelDate: text }, { requiredKeys: [] }),
      (body) => {
        const r = normalizeBookingInput(body);
        if (!r.ok) {
          assert.equal(typeof r.message, 'string');
          return;
        }
        for (const t of r.data.travellers || []) {
          assert.ok(t.name.length > 0 && t.name.length <= L.name);
          assert.ok(t.age === null || (Number.isInteger(t.age) && t.age >= 0 && t.age <= L.maxAge));
        }
        if (r.data.payment) {
          const p = r.data.payment;
          assert.ok(p.totalAmount >= 0 && p.received >= 0 && p.received <= p.totalAmount && p.totalAmount <= L.maxAmount);
          assert.ok(balanceOf(p) >= 0);
        }
        const labels = (r.data.customFields || []).map((f) => f.label.toLowerCase());
        assert.equal(new Set(labels).size, labels.length);
        // cleaning what was kept changes nothing
        const again = normalizeBookingInput({ ...r.data, payment: r.data.payment && { ...r.data.payment, balanceDueDate: r.data.payment.balanceDueDate?.toISOString() }, travelDate: r.data.travelDate?.toISOString() });
        assert.equal(again.ok, true, again.message);
        assert.deepEqual(again.data.travellers, r.data.travellers);
        assert.deepEqual(again.data.customFields, r.data.customFields);
        assert.equal(again.data.notes, r.data.notes);
        assert.deepEqual(again.data.payment, r.data.payment);
      }
    ),
    { numRuns: 400 }
  );
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The frozen copy of a quotation

const hotel = (name) => ({ hotelName: name, city: 'Udaipur', photos: [{ token: 'abc', width: 10, height: 10 }] });
const quotation = (over = {}) => ({
  _id: 'q1', __v: 3, createdAt: new Date(), updatedAt: new Date(), deleted: false, createdBy: 'u1', createdByName: 'Sana', isLocked: false, confirmationId: '', confirmationNo: '',
  quotationNo: '7H-QT-2026-001', quotationType: 'Package', clientName: 'Aarav', destination: 'RAJASTHAN', itinerary: [{ title: 'Day 1' }],
  packageDetails: { hotels: [hotel('Original')], inclusions: ['Breakfast'] }, pricing: { grandTotal: 120000, totalCostPerPerson: 30000, items: [{ name: 'Package' }] }, options: [], ...over
});
const optionsQ = () => quotation({
  options: [
    { name: 'Option A', hotels: [hotel('Hotel A')], pricePerPerson: 30000, totalPrice: 120000, priceNote: 'Per person' },
    { name: 'Option B', hotels: [hotel('Hotel B')], pricePerPerson: 42000.5, totalPrice: 168002, priceNote: 'Per person (incl. GST)' }
  ]
});

test('a quotation without options is copied as it is, minus the bookkeeping and the lock', () => {
  const r = confirmationFromQuotation(quotation(), undefined);
  assert.equal(r.ok, true);
  for (const dropped of ['_id', '__v', 'createdAt', 'updatedAt', 'deleted', 'createdBy', 'createdByName', 'isLocked', 'confirmationId', 'confirmationNo']) assert.equal(dropped in r.quote, false, dropped);
  assert.deepEqual([r.quote.quotationNo, r.quote.destination, r.quote.packageDetails.hotels[0].hotelName, r.quote.itinerary.length], ['7H-QT-2026-001', 'RAJASTHAN', 'Original', 1]);
  assert.deepEqual([r.optionName, r.totalAmount], ['', 120000]);
});

test('with options, the accepted option becomes the hotels and the price, and the other options are left out', () => {
  const r = confirmationFromQuotation(optionsQ(), 1);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.quote.options, []);
  assert.deepEqual(r.quote.packageDetails.hotels.map((h) => h.hotelName), ['Hotel B']);
  assert.deepEqual(r.quote.packageDetails.inclusions, ['Breakfast'], 'the rest of the package details is kept');
  assert.equal(r.quote.pricing.grandTotal, 168002);
  assert.equal(r.quote.pricing.totalCostPerPerson, 42000.5);
  assert.equal(r.quote.pricing.totalCostNote, 'Rs 42,000.5 Per person (incl. GST)');
  assert.deepEqual(r.quote.pricing.items, []);
  assert.deepEqual([r.optionName, r.totalAmount], ['Option B', 168002]);
  assert.equal(confirmationFromQuotation(optionsQ(), '0').optionName, 'Option A', 'the digits of an option number are accepted');
});

test('an option sent without a total is priced as the price per person times the guests', () => {
  const q = quotation({ paxDetails: '3 Adults + 1 Child', options: [{ name: 'Option A', hotels: [], pricePerPerson: 10000.5, totalPrice: 0, priceNote: '' }] });
  const r = confirmationFromQuotation(q, 0);
  assert.deepEqual([r.totalAmount, r.quote.pricing.grandTotal, r.quote.pricing.totalCostNote], [30001.5, 30001.5, 'Rs 10,000.5 Per person']);
  assert.equal(confirmationFromQuotation({ ...q, paxDetails: '' }, 0).totalAmount, 10000.5, 'no number of guests means one');
});

test('with options, choosing one is required and must exist', () => {
  assert.equal(confirmationFromQuotation(optionsQ(), undefined).message, 'This quotation offers 2 hotel options. Please choose the option the client accepted.');
  assert.equal(confirmationFromQuotation(optionsQ(), 'B').ok, false);
  assert.equal(confirmationFromQuotation(optionsQ(), 2).message, 'Please choose one of the 2 hotel options.');
  assert.equal(confirmationFromQuotation(optionsQ(), -1).ok, false);
  assert.equal(confirmationFromQuotation(optionsQ(), 1.5).ok, false);
  assert.equal(confirmationFromQuotation(optionsQ(), null).ok, false);
});

test('copying never changes the quotation it was made from', () => {
  const q = optionsQ();
  const before = JSON.stringify(q);
  confirmationFromQuotation(q, 1);
  assert.equal(JSON.stringify(q), before);
});

test('a quotation without options ignores an option number', () => {
  assert.equal(confirmationFromQuotation(quotation(), 3).ok, true);
});

test('the client\'s phone and e-mail can be kept on the booking: tidied, checked in plain words, and emptied to clear', () => {
  assert.deepEqual(ok({ clientPhone: '  +91 98765 43210 ', clientEmail: ' Meera@Example.com ' }), { clientPhone: '+91 98765 43210', clientEmail: 'Meera@Example.com' });
  assert.deepEqual(ok({ clientPhone: '', clientEmail: '' }), { clientPhone: '', clientEmail: '' });
  assert.deepEqual(ok({}), {}, 'not mentioned: not touched');
  assert.match(bad({ clientPhone: 'call me' }), /phone number can only have digits/);
  assert.match(bad({ clientPhone: '12' }), /phone number can only have digits/);
  assert.match(bad({ clientPhone: '9'.repeat(40) }), /phone number/);
  assert.match(bad({ clientEmail: 'meera@' }), /e-mail address does not look right/);
  assert.match(bad({ clientEmail: 'a@example.com, b@example.com' }), /e-mail address does not look right/);
  assert.match(bad({ clientEmail: 'a@example.com\nBcc: x@example.com' }), /e-mail address does not look right/);
  assert.match(bad({ clientPhone: { $ne: '' } }), /must be text|phone number/);
});

test('property: whatever is sent as the client\'s contact, it is either refused with a message or stored tidy and safe', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 60 }), fc.string({ maxLength: 60 }), (phone, email) => {
      const r = normalizeBookingInput({ clientPhone: phone, clientEmail: email });
      if (r.ok) {
        assert.match(r.data.clientPhone, /^(\+?[0-9][0-9 ().-]{4,28})?$/);
        assert.match(r.data.clientEmail, /^([^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+)?$/);
      } else assert.ok(r.message.length > 8);
    }),
    { numRuns: 300 }
  );
});
