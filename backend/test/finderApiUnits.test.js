import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { FOUND_LIMITS, foundNameKey, foundPhotoTokens, normalizeFoundInput } from '../src/utils/foundHotelInput.js';
import { IMAGE_TICKET_SECONDS, readImageTicket, signImageTicket } from '../src/services/hotelFinder/imageToken.js';

// ---- picture tickets ----

const SECRET = 'a-long-test-secret-a-long-test-secret';

test('a picture ticket carries one address and a referrer, and is read back only with the same secret within the hour', () => {
  const now = 1_800_000_000_000;
  const ticket = signImageTicket({ url: 'https://hotel.com/a.jpg?x=1&y=2', referer: 'https://hotel.com' }, SECRET, now);
  assert.match(ticket, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(readImageTicket(ticket, SECRET, now + 1000), { ok: true, url: 'https://hotel.com/a.jpg?x=1&y=2', referer: 'https://hotel.com' });
  assert.equal(readImageTicket(ticket, SECRET, now + IMAGE_TICKET_SECONDS * 1000 + 1000).reason, 'expired');
  assert.equal(readImageTicket(ticket, 'another secret', now).reason, 'forged');
  const [payload, tag] = ticket.split('.');
  const other = Buffer.from(JSON.stringify({ u: 'http://127.0.0.1/', r: '', e: 9_999_999_999 })).toString('base64url');
  assert.equal(readImageTicket(`${other}.${tag}`, SECRET, now).reason, 'forged');
  assert.equal(readImageTicket(`${payload}.${tag.slice(0, -1)}A`, SECRET, now).reason, 'forged');
  for (const bad of ['', 'x', 'a.b.c', '.', 'a.', '.b', null, undefined, 42, {}, 'x'.repeat(4000), 'a b.c d']) assert.equal(readImageTicket(bad, SECRET, now).ok, false, String(bad));
});

test('property: any address survives the round trip, and no changed ticket is accepted', () => {
  fc.assert(
    fc.property(fc.webUrl(), fc.oneof(fc.constant(''), fc.webUrl()), fc.integer({ min: 0, max: 200 }), (url, referer, at) => {
      const now = 1_800_000_000_000;
      const ticket = signImageTicket({ url, referer }, SECRET, now);
      assert.deepEqual(readImageTicket(ticket, SECRET, now), { ok: true, url, referer });
      const flipped = `${ticket.slice(0, at % ticket.length)}${ticket[at % ticket.length] === 'A' ? 'B' : 'A'}${ticket.slice((at % ticket.length) + 1)}`;
      if (flipped !== ticket) assert.equal(readImageTicket(flipped, SECRET, now).ok, false);
    }),
    { numRuns: 300 }
  );
});

// ---- what a found hotel may hold ----

const ok = (body, options) => {
  const r = normalizeFoundInput(body, options);
  assert.equal(r.ok, true, r.message);
  return r.data;
};
const bad = (body, message, options) => {
  const r = normalizeFoundInput(body, options);
  assert.equal(r.ok, false, JSON.stringify(body).slice(0, 100));
  assert.match(r.message, message);
};

test('only the name is required; everything else may be missing', () => {
  const data = ok({ name: '  The  Grand  ' });
  assert.equal(data.name, 'The Grand');
  assert.equal(data.starRating, 'Unrated');
  assert.deepEqual(data.phones, []);
  assert.equal(data.rates, null);
  assert.equal(data.geo, null);
  assert.equal(data.source, 'manual');
  bad({}, /Please enter the name of the hotel/);
  bad({ name: '   ' }, /Please enter the name/);
  bad(null, /could not be read/);
  bad([], /could not be read/);
  bad('x', /could not be read/);
});

test('an update checks only what it carries', () => {
  assert.deepEqual(ok({ notes: ' hello ' }, { partial: true }), { notes: 'hello' });
  assert.deepEqual(ok({}, { partial: true }), {});
  bad({ name: '' }, /Please enter the name/, { partial: true });
  bad({ emails: ['x'] }, /does not look right/, { partial: true });
});

test('numbers: rates, ratings, position and level are checked and tidied', () => {
  assert.deepEqual(ok({ name: 'A', rates: { currency: 'inr', from: '3500', to: '3000', unit: 'weird', text: 't' } }).rates, { currency: 'INR', from: 3500, to: 3500, unit: 'night', text: 't', note: '', lines: [] });
  assert.equal(ok({ name: 'A', rates: { from: 0 } }).rates, null, 'no rate is no rate');
  bad({ name: 'A', rates: { from: -5 } }, /must be an amount/);
  bad({ name: 'A', rates: { from: 1e12 } }, /must be an amount/);
  bad({ name: 'A', rates: 'cheap' }, /rates are not valid/);
  assert.equal(ok({ name: 'A', priceLevel: 9 }).priceLevel, 0);
  assert.equal(ok({ name: 'A', priceLevel: 3 }).priceLevel, 3);
  assert.deepEqual(ok({ name: 'A', geo: { lat: '15.5', lng: 73 } }).geo, { lat: 15.5, lng: 73 });
  bad({ name: 'A', geo: { lat: 91, lng: 0 } }, /map position/);
  bad({ name: 'A', geo: 'here' }, /map position/);
  assert.deepEqual(ok({ name: 'A', guestRating: { value: 4.2, best: 5, count: 12.5 } }).guestRating, { value: 4.2, best: 5, count: 0 });
  bad({ name: 'A', guestRating: { value: 0, best: 5 } }, /guest rating/);
});

test('lists are tidy and bounded', () => {
  assert.deepEqual(ok({ name: 'A', amenities: [' Pool ', 'pool', '', 'Spa'] }).amenities, ['Pool', 'Spa']);
  bad({ name: 'A', amenities: 'Pool' }, /must be a list/);
  bad({ name: 'A', amenities: Array.from({ length: 70 }, (_, i) => `Item ${i}`) }, /at most 60/);
  bad({ name: 'A', phones: Array.from({ length: 9 }, (_, i) => `+91 98290 1234${i}`) }, /at most 8/);
  assert.deepEqual(ok({ name: 'A', tags: ['Beach', 'beach', 'Family'] }).tags, ['beach', 'family']);
  assert.equal(ok({ name: 'A', social: [{ network: 'Facebook', url: 'facebook.com/x' }, { network: 'x', url: '' }, 'junk'] }).social.length, 1);
  assert.deepEqual(ok({ name: 'A', warnings: ['<b>Careful</b>', 7, ''] }).warnings, ['Careful']);
  assert.deepEqual(ok({ name: 'A', pagesRead: [{ url: 'https://h.com/c', label: 'Contact' }, { url: 'javascript:x', label: 'Bad' }, 3] }).pagesRead, [{ url: 'https://h.com/c', label: 'Contact' }]);
});

test('text never carries markup or control characters, and long text is refused, not cut', () => {
  assert.equal(ok({ name: 'A', description: 'Line one\u0000\n\n\n\nLine <b>two</b>   spaced' }).description, 'Line one\n\nLine two spaced');
  assert.equal(ok({ name: 'A', policies: { cancellation: '<script>x</script>Free' } }).policies.cancellation, 'xFree');
  bad({ name: 'A', description: 'x'.repeat(FOUND_LIMITS.description + 1) }, /too long/);
  bad({ name: 'A', notes: 5 }, /must be text/);
});

test('names and keys: the same hotel in the same city is the same hotel', () => {
  assert.equal(foundNameKey({ name: ' Palm  Grove ', address: { locality: 'Candolim' } }), foundNameKey({ name: 'palm grove', address: { locality: ' CANDOLIM ' } }));
  assert.notEqual(foundNameKey({ name: 'Palm Grove', address: { locality: 'Goa' } }), foundNameKey({ name: 'Palm Grove', address: { locality: 'Kerala' } }));
  assert.deepEqual(foundPhotoTokens({ photos: [{ token: 'a' }, { token: 'b' }] }), ['a', 'b']);
  assert.deepEqual(foundPhotoTokens({}), []);
});

test('property: whatever is sent, the answer is a plain success with clean data, or a message in words', () => {
  fc.assert(
    fc.property(fc.anything({ maxDepth: 3 }), (body) => {
      const r = normalizeFoundInput(body);
      assert.equal(typeof r.ok, 'boolean');
      if (r.ok) {
        assert.equal(typeof r.data.name, 'string');
        assert.ok(r.data.name.length > 0 && r.data.name.length <= FOUND_LIMITS.name);
        assert.ok(r.data.phones.length <= FOUND_LIMITS.phones && r.data.amenities.length <= FOUND_LIMITS.amenities);
        assert.doesNotMatch(JSON.stringify(r.data), /<[a-z]/i);
      } else {
        assert.equal(typeof r.message, 'string');
        assert.ok(r.message.length > 5);
      }
    }),
    { numRuns: 800 }
  );
});
