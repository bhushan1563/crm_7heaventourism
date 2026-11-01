import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { OPTION_LIMITS as L, normalizeQuotationOptions, optionPhotoTokens } from '../src/utils/quotationOptions.js';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const HOTEL_ID = '0123456789abcdef01234567';
const ok = (value) => {
  const r = normalizeQuotationOptions(value);
  assert.equal(r.ok, true, r.message);
  return r.value;
};
const bad = (value) => {
  const r = normalizeQuotationOptions(value);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};
const option = (over = {}) => ({ name: 'Option A', hotels: [{ hotelName: 'Hotel Rivatas', city: 'Varanasi', nights: '2 Nights' }], pricePerPerson: 25000, totalPrice: 50000, priceNote: 'Per person on twin sharing', ...over });

test('an empty list is fine (a quotation with one offer, as before)', () => {
  assert.deepEqual(ok([]), []);
});

test('options are tidied: names, prices, note, and each option\'s hotels', () => {
  const [a, b] = ok([option({ name: '  Option   A ', pricePerPerson: '25000.456', recommended: true }), { hotels: [] }]);
  assert.equal(a.name, 'Option A');
  assert.equal(a.pricePerPerson, 25000.46, 'amounts are kept to the paisa');
  assert.equal(a.recommended, true);
  assert.equal(a.hotels[0].hotelName, 'Hotel Rivatas');
  assert.equal(a.hotels[0].hotelId, '', 'a stay typed by hand has no hotel reference');
  assert.deepEqual([b.name, b.recommended, b.pricePerPerson, b.totalPrice, b.priceNote, b.hotels], ['Option 2', false, 0, 0, 'Per person', []]);
});

test('an option\'s hotels keep their hotel reference, photos, amenities and times, like any hotel stay', () => {
  const [o] = ok([option({ hotels: [{ hotelName: 'The Ubud Retreat', hotelId: HOTEL_ID, photos: [{ token: TOKEN, caption: ' Pool ' }], amenities: ['Pool', 'pool', 'Spa'], checkInTime: '14:00' }] })]);
  assert.equal(o.hotels[0].hotelId, HOTEL_ID);
  assert.deepEqual(o.hotels[0].photos, [{ token: TOKEN, caption: 'Pool' }]);
  assert.deepEqual(o.hotels[0].amenities, ['Pool', 'Spa']);
  assert.deepEqual(optionPhotoTokens([o]), [TOKEN]);
});

test('every problem is explained in plain language and names the option', () => {
  assert.equal(bad('nope'), 'The options must be a list.');
  assert.match(bad(Array.from({ length: L.options + 1 }, () => ({}))), /at most 6 options \(there are 7\)/);
  assert.match(bad([{}, 'oops']), /^Option 2 is not valid\./);
  assert.match(bad([option({ name: 'x'.repeat(L.name + 1) })]), /name of option 1 is too long/);
  assert.match(bad([option({ pricePerPerson: -5 })]), /price per person of option 1 must be an amount from 0 to/);
  assert.match(bad([option({}), option({ totalPrice: 'lots' })]), /total price of option 2 must be an amount/);
  assert.match(bad([option({ pricePerPerson: 2e12 })]), /price per person of option 1/);
  assert.match(bad([option({ pricePerPerson: { $gt: 0 } })]), /price per person of option 1/);
  assert.match(bad([option({ priceNote: 'x'.repeat(L.note + 1) })]), /price note of option 1 is too long/);
  assert.match(bad([option({ hotels: 'one' })]), /^Option 1: The hotel stays must be a list/);
  assert.match(bad([option({ hotels: [{ hotelId: 'bad' }] })]), /^Option 1: The hotel chosen for stay 1 is not valid/);
  assert.match(bad([option({ hotels: Array.from({ length: L.hotelsPerOption + 1 }, () => ({})) })]), /Option 1 can have at most 10 hotels/);
  assert.match(bad([option({ recommended: 'yes' })]), /option 1 is recommended must be yes or no/);
  assert.equal(bad([option({ recommended: true }), option({ recommended: true })]), 'Only one option can be marked as recommended.');
});

test('property: whatever arrives, the answer is a clear message or options that obey every limit; cleaning twice changes nothing', () => {
  const text = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom('<script>x</script>', '\u0000', 'x'.repeat(300), HOTEL_ID), fc.integer({ min: -5, max: 5_000_000 }), fc.double({ noNaN: true, min: -10, max: 1e10 }), fc.constant(null), fc.boolean());
  const stay = fc.record({ hotelName: text, hotelId: text, nights: text, photos: fc.oneof(text, fc.array(fc.record({ token: text }), { maxLength: 3 })) }, { requiredKeys: [] });
  const opt = fc.record({ name: text, recommended: text, hotels: fc.oneof(text, fc.array(stay, { maxLength: 3 })), pricePerPerson: text, totalPrice: text, priceNote: text }, { requiredKeys: [] });
  fc.assert(
    fc.property(fc.oneof(text, fc.array(opt, { maxLength: 4 })), (input) => {
      const r = normalizeQuotationOptions(input);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      assert.ok(r.value.length <= L.options);
      assert.ok(r.value.filter((o) => o.recommended).length <= 1);
      for (const o of r.value) {
        assert.ok(o.name.length > 0 && o.name.length <= L.name);
        assert.ok(o.hotels.length <= L.hotelsPerOption);
        for (const n of [o.pricePerPerson, o.totalPrice]) assert.ok(Number.isFinite(n) && n >= 0 && n <= L.maxPrice);
      }
      assert.deepEqual(normalizeQuotationOptions(r.value).value, r.value);
    }),
    { numRuns: 400 }
  );
});
