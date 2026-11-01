import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { HOTEL_LIMITS as L, MEAL_PLAN_OPTIONS, STAR_RATINGS, hotelPhotoTokens, nameKeyOf, normalizeHotelInput } from '../src/utils/hotelInput.js';

const TOKEN_A = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const valid = (over = {}) => ({ name: 'The Ubud Retreat', city: 'Ubud', country: 'Indonesia', starRating: '5 star', ...over });
const ok = (body, opts) => {
  const r = normalizeHotelInput(body, opts);
  assert.equal(r.ok, true, r.message);
  return r.data;
};
const bad = (body, opts) => {
  const r = normalizeHotelInput(body, opts);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('a minimal hotel is accepted and tidied up, with sensible defaults', () => {
  const d = ok({ name: '  The   Ubud  Retreat ', city: ' Ubud ' });
  assert.equal(d.name, 'The Ubud Retreat');
  assert.equal(d.city, 'Ubud');
  assert.equal(d.starRating, 'Unrated');
  assert.equal(d.checkInTime, '14:00');
  assert.equal(d.checkOutTime, '11:00');
  assert.deepEqual([d.photos, d.amenities, d.roomTypes, d.mealPlans, d.tags], [[], [], [], [], []]);
});

test('the name and the city are required, in plain words', () => {
  assert.equal(bad({ city: 'Ubud' }), 'Please enter the name of the hotel.');
  assert.equal(bad({ name: '   ', city: 'Ubud' }), 'Please enter the name of the hotel.');
  assert.equal(bad({ name: 'X' }), 'Please enter the city.');
});

test('two spellings of the same hotel get the same key', () => {
  assert.equal(nameKeyOf('The  Ubud Retreat', ' UBUD '), nameKeyOf('the ubud retreat', 'ubud'));
  assert.notEqual(nameKeyOf('Hyatt', 'Goa'), nameKeyOf('Hyatt', 'Delhi'));
  assert.equal(nameKeyOf('Café Royal', 'Paris'), nameKeyOf('Café Royal', 'paris'));
});

test('rating, meal plans and times must be from the allowed choices, and say which', () => {
  assert.match(bad(valid({ starRating: '7 star' })), /Please choose the rating from the list: 5 star, 4 star/);
  assert.equal(ok(valid({ starRating: '' })).starRating, 'Unrated');
  assert.match(bad(valid({ mealPlans: ['All you can eat'] })), /meal plans must be chosen from: CP \(Breakfast Only\)/);
  assert.deepEqual(ok(valid({ mealPlans: ['MAP (Breakfast & Dinner)', 'CP (Breakfast Only)', 'CP (Breakfast Only)'] })).mealPlans, ['CP (Breakfast Only)', 'MAP (Breakfast & Dinner)'], 'each once, in the standard order');
  assert.match(bad(valid({ checkInTime: '25:00' })), /check-in time must be a time like 14:00/);
  assert.match(bad(valid({ checkOutTime: '9am' })), /check-out time must be a time like 14:00/);
  assert.equal(ok(valid({ checkInTime: '', checkOutTime: null })).checkInTime, '14:00');
});

test('contact details are checked and tidied', () => {
  const d = ok(valid({ phone: '+62 361 123-456', email: ' Reservations@Hotel.COM ', website: 'www.ubudretreat.com/' }));
  assert.equal(d.phone, '+62 361 123-456');
  assert.equal(d.email, 'reservations@hotel.com');
  assert.equal(d.website, 'https://www.ubudretreat.com');
  assert.equal(ok(valid({ website: 'http://example.org/path?x=1' })).website, 'http://example.org/path?x=1');
  assert.match(bad(valid({ phone: 'call me' })), /phone number may only contain digits/);
  assert.match(bad(valid({ email: 'nope' })), /email address does not look right/);
  assert.match(bad(valid({ website: 'javascript:alert(1)' })), /website address does not look right/);
  assert.match(bad(valid({ website: 'not a site' })), /website address does not look right/);
  assert.match(bad(valid({ website: 'ftp://example.com' })), /website address does not look right/);
});

test('amenities and tags are trimmed, not repeated, and limited', () => {
  assert.deepEqual(ok(valid({ amenities: [' Pool ', 'pool', 'Spa', '', 'WiFi'] })).amenities, ['Pool', 'Spa', 'WiFi']);
  assert.deepEqual(ok(valid({ tags: ['Beach', 'beach', ' Family '] })).tags, ['beach', 'family'], 'tags are lower case');
  assert.match(bad(valid({ amenities: Array.from({ length: L.amenities + 1 }, (_, i) => `a${i}`) })), /at most 40 amenities \(there are 41\)/);
  assert.match(bad(valid({ tags: Array.from({ length: L.tags + 1 }, (_, i) => `t${i}`) })), /at most 10 tags/);
  assert.match(bad(valid({ amenities: ['x'.repeat(L.amenityLength + 1)] })), /an amenity is too long/i);
  assert.match(bad(valid({ amenities: 'pool' })), /Amenities must be a list/);
});

test('room types need a name, are not repeated, and explain the problem', () => {
  assert.deepEqual(ok(valid({ roomTypes: [{ name: ' Deluxe Room ', details: 'King bed, 38 sq m' }, { name: 'Suite' }] })).roomTypes, [{ name: 'Deluxe Room', details: 'King bed, 38 sq m' }, { name: 'Suite', details: '' }]);
  assert.match(bad(valid({ roomTypes: [{ name: 'Suite' }, { details: 'no name' }] })), /Please enter a name for room type 2/);
  assert.match(bad(valid({ roomTypes: [{ name: 'Suite' }, { name: 'suite' }] })), /"suite" is listed twice/);
  assert.match(bad(valid({ roomTypes: ['Suite'] })), /Room type 1 is not valid/);
  assert.match(bad(valid({ roomTypes: Array.from({ length: L.roomTypes + 1 }, (_, i) => ({ name: `R${i}` })) })), /at most 30 room types/);
});

test('formatted text is cleaned; plain text stays as typed', () => {
  assert.equal(ok(valid({ description: '<p onclick="x()">Lovely <b>pool</b></p><script>alert(1)</script>' })).description, '<p>Lovely <strong>pool</strong></p>');
  assert.equal(ok(valid({ cancellationPolicy: 'Free until 7 days <before> arrival' })).cancellationPolicy, 'Free until 7 days <before> arrival');
  assert.match(bad(valid({ description: 'x'.repeat(L.description + 1) })), /description is too long/i);
});

test('photos are checked for shape and listed once', () => {
  assert.deepEqual(ok(valid({ photos: [{ token: TOKEN_A, caption: ' Pool ', width: 1, height: 1 }, { token: TOKEN_A }] })).photos, [{ token: TOKEN_A, caption: 'Pool' }]);
  assert.match(bad(valid({ photos: [{ token: '../x' }] })), /contains a photo that is not valid/);
  assert.match(bad(valid({ photos: 'nope' })), /must be a list of photos/);
  assert.match(bad(valid({ photos: Array.from({ length: L.photos + 1 }, (_, i) => ({ token: `${'A'.repeat(20)}${String(i).padStart(4, '0')}` })) })), /at most 30 photos/);
  assert.deepEqual(hotelPhotoTokens(ok(valid({ photos: [{ token: TOKEN_A }] }))), [TOKEN_A]);
});

test('an update checks only what it sends', () => {
  assert.deepEqual(ok({ status: 'Archived' }, { partial: true }), { status: 'Archived' });
  assert.deepEqual(ok({ phone: '+91 98765 43210' }, { partial: true }), { phone: '+91 98765 43210' });
  assert.equal(bad({ name: '' }, { partial: true }), 'Please enter the name of the hotel.');
  assert.match(bad({ status: 'Gone' }, { partial: true }), /Status must be one of: Active, Archived/);
  assert.deepEqual(ok({}, { partial: true }), {});
});

test('anything that is not an object is refused politely', () => {
  for (const v of [null, undefined, 'x', 5, [], true]) assert.match(bad(v), /could not be read/);
});

test('property: whatever arrives, the answer is a clear message or a hotel that obeys every rule; cleaning twice changes nothing', () => {
  const text = fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom('<script>x</script>', '<p>ok</p>', '\u0000', 'x'.repeat(400), '  Spa  ', '14:30', '+91 98765 43210', 'a@b.co'), fc.integer(), fc.constant(null), fc.array(fc.string({ maxLength: 4 }), { maxLength: 3 }));
  const room = fc.record({ name: text, details: text }, { requiredKeys: [] });
  const body = fc.record(
    { name: text, city: text, country: text, area: text, address: text, starRating: fc.oneof(text, fc.constantFrom(...STAR_RATINGS)), description: text, phone: text, email: text, website: text, checkInTime: text, checkOutTime: text, amenities: fc.oneof(text, fc.array(text, { maxLength: 5 })), roomTypes: fc.oneof(text, fc.array(room, { maxLength: 4 })), mealPlans: fc.oneof(text, fc.array(fc.constantFrom(...MEAL_PLAN_OPTIONS), { maxLength: 6 })), tags: fc.oneof(text, fc.array(text, { maxLength: 5 })), photos: fc.oneof(text, fc.array(fc.record({ token: text, caption: text }), { maxLength: 3 })), status: text },
    { requiredKeys: [] }
  );
  fc.assert(
    fc.property(body, (input) => {
      const r = normalizeHotelInput(input);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      const d = r.data;
      assert.ok(d.name.length > 0 && d.name.length <= L.name && d.city.length > 0 && d.city.length <= L.city);
      assert.ok(STAR_RATINGS.includes(d.starRating));
      assert.ok(d.amenities.length <= L.amenities && d.roomTypes.length <= L.roomTypes && d.tags.length <= L.tags && d.photos.length <= L.photos);
      assert.ok(/^([01]\d|2[0-3]):[0-5]\d$/.test(d.checkInTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(d.checkOutTime));
      if (d.email) assert.match(d.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      if (d.website) assert.match(d.website, /^https?:\/\//);
      if (/^\s*<(?:p|ul|ol)[\s>/]/i.test(d.description)) assert.doesNotMatch(d.description, /<script|<img|\sonerror=/i);
      const again = normalizeHotelInput(d);
      assert.equal(again.ok, true, again.message);
      assert.deepEqual(again.data, d);
    }),
    { numRuns: 500 }
  );
});
