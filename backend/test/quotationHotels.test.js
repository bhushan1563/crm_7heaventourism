import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { STAY_LIMITS as L, normalizeQuotationHotels, stayPhotoTokens } from '../src/utils/quotationHotels.js';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const HOTEL_ID = '0123456789abcdef01234567';
const ok = (value) => {
  const r = normalizeQuotationHotels(value);
  assert.equal(r.ok, true, r.message);
  return r.value;
};
const bad = (value) => {
  const r = normalizeQuotationHotels(value);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('stays typed by hand, and what the mobile app sends today, are accepted untouched', () => {
  const stay = { nights: '2 Nights', city: 'Varanasi', hotelName: 'Hotel Rivatas', starRating: '4 star', roomCategory: 'Deluxe Room', mealPlan: 'CP (Breakfast Only)', noOfRooms: '1 Room', address: 'Near the ghat', contactNumber: '0542 111', email: 'a@b.co' };
  const [out] = ok([stay]);
  for (const [key, value] of Object.entries(stay)) assert.equal(out[key], value, `${key} is passed through`);
  assert.deepEqual([out.hotelId, out.photos, out.amenities, out.roomOptions, out.checkInTime, out.checkOutTime], ['', [], [], [], '', '']);
});

test('an empty list is fine (all stays can be removed)', () => {
  assert.deepEqual(ok([]), []);
});

test('a stay taken from the hotel list keeps its hotel, photos, amenities, room options and times, tidied', () => {
  const [out] = ok([{ hotelName: 'The Ubud Retreat', hotelId: HOTEL_ID, photos: [{ token: TOKEN, caption: ' Pool ', width: 1, height: 1 }, { token: TOKEN }], amenities: [' Pool ', 'pool', 'Spa', ''], roomOptions: ['Deluxe', 'Suite', 'deluxe'], checkInTime: '14:00', checkOutTime: '11:00' }]);
  assert.equal(out.hotelId, HOTEL_ID);
  assert.deepEqual(out.photos, [{ token: TOKEN, caption: 'Pool' }], 'listed once, sizes come from the server later');
  assert.deepEqual(out.amenities, ['Pool', 'Spa']);
  assert.deepEqual(out.roomOptions, ['Deluxe', 'Suite']);
  assert.deepEqual([out.checkInTime, out.checkOutTime], ['14:00', '11:00']);
  assert.deepEqual(stayPhotoTokens([out]), [TOKEN]);
});

test('every problem is explained in plain language and names the stay', () => {
  assert.equal(bad('nope'), 'The hotel stays must be a list.');
  assert.match(bad(Array.from({ length: L.stays + 1 }, () => ({}))), /at most 50 hotel stays \(there are 51\)/);
  assert.match(bad([{}, 'oops']), /^Hotel stay 2 is not valid\./);
  assert.match(bad([{ hotelId: 'not-an-id' }]), /hotel chosen for stay 1 is not valid\. Please choose it again from the hotel list/);
  assert.match(bad([{ hotelId: { $ne: null } }]), /hotel chosen for stay 1 is not valid/);
  assert.match(bad([{ photos: 'x' }]), /Hotel stay 1 must be a list of photos/);
  assert.match(bad([{ photos: Array.from({ length: L.photos + 1 }, (_, i) => ({ token: `${'A'.repeat(23)}${i}` })) }]), /Hotel stay 1 can have at most 6 photos/);
  assert.match(bad([{ photos: [{ token: '../x' }] }]), /Hotel stay 1 contains a photo that is not valid/);
  assert.match(bad([{ amenities: 'pool' }]), /amenities of hotel stay 1 must be a list/);
  assert.match(bad([{ amenities: Array.from({ length: L.amenities + 1 }, (_, i) => `a${i}`) }]), /amenities of hotel stay 1 can have at most 40 entries/);
  assert.match(bad([{ roomOptions: ['x'.repeat(L.roomLength + 1)] }]), /too long/);
  assert.match(bad([{ checkInTime: '25:00' }]), /check-in time of hotel stay 1 must be a time like 14:00/);
  assert.match(bad([{}, { checkOutTime: 'noon' }]), /check-out time of hotel stay 2/);
});

test('property: whatever arrives, the answer is a clear message or stays that obey every limit; cleaning twice changes nothing', () => {
  const text = fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom('<script>x</script>', '\u0000', 'x'.repeat(200), '14:00', HOTEL_ID), fc.integer(), fc.constant(null), fc.array(fc.string({ maxLength: 4 }), { maxLength: 2 }));
  const stay = fc.record({ hotelName: text, city: text, hotelId: text, photos: fc.oneof(text, fc.array(fc.record({ token: text, caption: text }), { maxLength: 4 })), amenities: fc.oneof(text, fc.array(text, { maxLength: 4 })), roomOptions: fc.oneof(text, fc.array(text, { maxLength: 4 })), checkInTime: text, checkOutTime: text }, { requiredKeys: [] });
  fc.assert(
    fc.property(fc.oneof(text, fc.array(stay, { maxLength: 5 })), (input) => {
      const r = normalizeQuotationHotels(input);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      for (const s of r.value) {
        assert.ok(s.photos.length <= L.photos && s.amenities.length <= L.amenities && s.roomOptions.length <= L.roomOptions);
        assert.ok(s.hotelId === '' || /^[0-9a-f]{24}$/i.test(s.hotelId));
        for (const t of [s.checkInTime, s.checkOutTime]) assert.ok(t === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
      }
      assert.deepEqual(normalizeQuotationHotels(r.value).value, r.value);
    }),
    { numRuns: 400 }
  );
});
