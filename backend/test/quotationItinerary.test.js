import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { QUOTATION_DAY_LIMITS as L, itineraryPhotoTokens, normalizeQuotationItinerary } from '../src/utils/quotationItinerary.js';

const TOKEN_A = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const ok = (value) => {
  const r = normalizeQuotationItinerary(value);
  assert.equal(r.ok, true, r.message);
  return r.value;
};
const bad = (value) => {
  const r = normalizeQuotationItinerary(value);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('days written before photos existed (plain text, no photos) stay valid exactly as they were', () => {
  const days = ok([
    { dayNumber: 'Day 01', title: 'Arrival & Welcome', description: 'Arrival at destination.\nMeet & greet, then transfer to the hotel.' },
    { dayNumber: 'Day 02', title: '', description: '' }
  ]);
  assert.equal(days[0].description, 'Arrival at destination.\nMeet & greet, then transfer to the hotel.', 'plain text is kept as typed');
  assert.deepEqual(days[0].photos, []);
  assert.equal(days[1].title, '', 'a day may have no title (the document shows a default)');
  assert.equal(days[1].dayNumber, 'Day 02');
});

test('what the mobile app sends today is accepted', () => {
  const days = ok([{ dayNumber: 'Day 03', title: 'Leisure & Local Exploration', description: 'Experience local highlights, shopping, and gourmet dining experiences.' }]);
  assert.equal(days.length, 1);
  assert.equal(days[0].stay, '');
  assert.equal(days[0].meals, '');
});

test('an empty list is fine (the days can be removed)', () => {
  assert.deepEqual(ok([]), []);
});

test('formatted text is cleaned, photos are tidied and the day number is filled in when missing', () => {
  const days = ok([
    { description: '<p onclick="x()">Hello <b>there</b></p><script>alert(1)</script>', stay: ' Ubud ', meals: 'Dinner', photos: [{ token: TOKEN_A, caption: '  Pool  ', width: 1, height: 1 }, { token: TOKEN_A }] }
  ]);
  assert.equal(days[0].description, '<p>Hello <strong>there</strong></p>');
  assert.equal(days[0].dayNumber, 'Day 01');
  assert.equal(days[0].stay, 'Ubud');
  assert.deepEqual(days[0].photos, [{ token: TOKEN_A, caption: 'Pool' }], 'the same photo twice is listed once, and sizes come from the server later');
});

test('every problem is explained in plain language and names the day', () => {
  assert.equal(bad('not a list'), 'The days of the itinerary must be a list.');
  assert.match(bad(Array.from({ length: L.maxDays + 1 }, () => ({}))), /at most 60 days \(there are 61\)/);
  assert.match(bad([{}, 'oops']), /^Day 2 is not valid\./);
  assert.match(bad([{ title: 'x'.repeat(L.title + 1) }]), /title of Day 1 is too long \(151 characters; the limit is 150\)/);
  assert.match(bad([{ stay: 'x'.repeat(L.stay + 1) }]), /overnight stay of Day 1 is too long/);
  assert.match(bad([{}, { description: 'x'.repeat(L.description + 1) }]), /Day 2/);
  assert.match(bad([{ photos: 'nope' }]), /Day 1 must be a list of photos/);
  assert.match(bad([{ photos: Array.from({ length: L.photosPerDay + 1 }, (_, i) => ({ token: `${'A'.repeat(23)}${i}` })) }]), /Day 1 can have at most 6 photos/);
  assert.match(bad([{ photos: [{ token: '../../etc/passwd' }] }]), /Day 1 contains a photo that is not valid/);
  assert.match(bad([{ title: { $ne: 1 } }]), /must be text/);
});

test('a quotation cannot carry an unreasonable number of photos', () => {
  const photo = (i) => ({ token: `${'A'.repeat(20)}${String(i).padStart(4, '0')}` });
  const days = Array.from({ length: 21 }, (_, d) => ({ photos: Array.from({ length: 6 }, (_, p) => photo(d * 6 + p)) }));
  assert.match(bad(days), /too many itinerary photos \(more than 120\)/);
});

test('the photo tokens of all days are listed for the existence check', () => {
  const days = ok([{ photos: [{ token: TOKEN_A }] }, { photos: [] }, { photos: [{ token: 'B'.repeat(24) }] }]);
  assert.deepEqual(itineraryPhotoTokens(days), [TOKEN_A, 'B'.repeat(24)]);
});

test('property: whatever arrives, the answer is either a clear message or days that obey every limit; never an exception', () => {
  const text = fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom('<script>x</script>', '<p>ok</p>', '<img src=x onerror=1>', '\u0000', 'x'.repeat(400)), fc.integer(), fc.constant(null), fc.array(fc.string({ maxLength: 4 }), { maxLength: 2 }));
  const day = fc.record({ dayNumber: text, title: text, description: text, stay: text, meals: text, photos: fc.oneof(text, fc.array(fc.record({ token: text, caption: text }), { maxLength: 4 })) }, { requiredKeys: [] });
  fc.assert(
    fc.property(fc.oneof(text, fc.array(day, { maxLength: 6 })), (input) => {
      const r = normalizeQuotationItinerary(input);
      if (!r.ok) return assert.equal(typeof r.message, 'string');
      for (const d of r.value) {
        assert.ok(d.title.length <= L.title && d.stay.length <= L.stay && d.meals.length <= L.meals && d.dayNumber.length <= L.dayNumber);
        assert.ok(d.photos.length <= L.photosPerDay);
        assert.equal(typeof d.description, 'string');
        if (/^\s*<(?:p|ul|ol)[\s>/]/i.test(d.description)) assert.doesNotMatch(d.description, /<script|<img|\sonerror=/i);
      }
      // cleaning twice changes nothing
      assert.deepEqual(normalizeQuotationItinerary(r.value).value, r.value);
    }),
    { numRuns: 400 }
  );
});
