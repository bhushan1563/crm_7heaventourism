import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { LIMITS, STATUSES, normalizeItineraryInput, normalizePhotos, photoTokensOf } from '../src/utils/itineraryInput.js';
import { looksLikeHtml } from '../src/utils/richText.js';

const TOKEN_A = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'BBBBBBBBBBBBBBBBBBBBBBBB';
const valid = (over = {}) => ({ title: 'Bali Escape', destination: 'Bali, Indonesia', nights: 5, days: [{ title: 'Arrival', description: '<p>Welcome</p>' }], ...over });
const ok = (body, opts) => {
  const r = normalizeItineraryInput(body, opts);
  assert.equal(r.ok, true, r.message);
  return r.data;
};
const bad = (body, opts) => {
  const r = normalizeItineraryInput(body, opts);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('a minimal itinerary is accepted and tidied up', () => {
  const data = ok({ title: '  Bali   Escape \n', destination: ' Bali ', nights: '5' });
  assert.equal(data.title, 'Bali Escape');
  assert.equal(data.destination, 'Bali');
  assert.equal(data.nights, 5);
  assert.deepEqual(data.days, []);
  assert.deepEqual(data.photos, []);
});

test('required fields give plain-language messages', () => {
  assert.equal(bad({ destination: 'Bali' }), 'Please enter a title for the itinerary.');
  assert.equal(bad({ title: '   ', destination: 'Bali' }), 'Please enter a title for the itinerary.');
  assert.equal(bad({ title: 'x' }), 'Please enter the destination.');
  assert.match(bad(valid({ days: [{ title: 'ok' }, { description: 'no title' }] })), /Please enter a title for Day 2\./);
});

test('limits are explained with the actual numbers', () => {
  assert.match(bad(valid({ title: 'x'.repeat(151) })), /Title for the itinerary is too long|A title for the itinerary is too long|too long \(151 characters; the limit is 150\)/);
  assert.match(bad(valid({ nights: 61 })), /whole number from 0 to 60/);
  assert.match(bad(valid({ nights: 2.5 })), /whole number/);
  assert.match(bad(valid({ nights: -1 })), /whole number/);
  assert.match(bad(valid({ nights: 'abc' })), /whole number/);
  assert.match(bad(valid({ days: new Array(61).fill({ title: 'd' }) })), /at most 60 days \(there are 61\)/);
  assert.match(bad(valid({ days: [{ title: 'd', description: 'x'.repeat(8001) }] })), /description of Day 1 is too long/i);
  assert.match(bad(valid({ summary: 'x'.repeat(5001) })), /overview is too long/i);
  assert.match(bad(valid({ inclusions: new Array(61).fill('a') })), /at most 60 items/);
});

test('values of the wrong type are refused, never stored (no object smuggling)', () => {
  assert.match(bad(valid({ title: { $ne: 1 } })), /must be text/);
  assert.match(bad(valid({ destination: ['a'] })), /must be text/);
  assert.match(bad(valid({ days: 'nope' })), /must be a list/);
  assert.match(bad(valid({ days: ['x'] })), /Day 1 is not valid/);
  assert.match(bad(valid({ tags: 'a,b' })), /must be a list/);
  assert.match(bad('a string'), /could not be read/);
  assert.match(bad(null), /could not be read/);
  assert.match(bad([]), /could not be read/);
});

test('formatted text is cleaned; plain text stays as typed', () => {
  const data = ok(valid({ summary: '<p onclick="x()">Hi</p><script>alert(1)</script>', days: [{ title: 'd', description: 'Line one\nLine two' }] }));
  assert.equal(data.summary, '<p>Hi</p>');
  assert.equal(data.days[0].description, 'Line one\nLine two');
});

test('photos: only well-formed references, duplicates dropped, captions tidied, caps enforced', () => {
  const data = ok(valid({ photos: [{ token: TOKEN_A, caption: '  Pool \n view ' }, { token: TOKEN_A }, { token: TOKEN_B }] }));
  assert.deepEqual(data.photos, [{ token: TOKEN_A, caption: 'Pool view' }, { token: TOKEN_B, caption: '' }]);
  assert.deepEqual(photoTokensOf(data), [TOKEN_A, TOKEN_B]);

  assert.match(bad(valid({ photos: [{ token: 'short' }] })), /not valid/);
  assert.match(bad(valid({ photos: [{ token: '../../etc/passwd' + 'x'.repeat(10) }] })), /not valid/);
  assert.match(bad(valid({ photos: [{ token: { $gt: '' } }] })), /not valid/);
  assert.match(bad(valid({ photos: [null] })), /not valid/);
  assert.match(bad(valid({ photos: 'x' })), /list of photos/);
  const many = Array.from({ length: LIMITS.itineraryPhotos + 1 }, (_, i) => ({ token: String(i).padStart(24, 'C') }));
  assert.match(bad(valid({ photos: many })), /at most 10 photos/);
  const day = Array.from({ length: LIMITS.photosPerDay + 1 }, (_, i) => ({ token: String(i).padStart(24, 'D') }));
  assert.match(bad(valid({ days: [{ title: 'd', photos: day }] })), /Day 1 can have at most 6 photos/);
  assert.match(bad(valid({ photos: [{ token: TOKEN_A, caption: 'x'.repeat(121) }] })), /caption is too long/);
  assert.equal(normalizePhotos(undefined, 'x', 3).ok, true);
});

test('tags are lower-cased, de-duplicated and capped', () => {
  assert.deepEqual(ok(valid({ tags: ['Beach', ' beach ', 'HONEYMOON', ''] })).tags, ['beach', 'honeymoon']);
  assert.match(bad(valid({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })), /at most 10 tags/);
  assert.match(bad(valid({ tags: ['x'.repeat(31)] })), /too long/);
});

test('status must be a known value', () => {
  for (const s of STATUSES) assert.equal(ok(valid({ status: s })).status, s);
  assert.match(bad(valid({ status: 'Deleted' })), /Status must be one of: Active, Archived/);
});

test('partial mode (updates) checks and returns only what was sent', () => {
  assert.deepEqual(ok({ title: 'New title' }, { partial: true }), { title: 'New title' });
  assert.deepEqual(ok({}, { partial: true }), {});
  assert.deepEqual(ok({ days: [] }, { partial: true }), { days: [] });
  assert.match(bad({ title: '' }, { partial: true }), /title for the itinerary/);
  assert.match(bad({ nights: 99 }, { partial: true }), /whole number/);
});

test('an itinerary cannot hold an unreasonable number of photos', () => {
  const days = Array.from({ length: 30 }, (_, d) => ({ title: `Day ${d}`, photos: Array.from({ length: 5 }, (__, p) => ({ token: `${String(d).padStart(2, '0')}${String(p).padStart(2, '0')}`.padEnd(24, 'E') })) }));
  assert.match(bad(valid({ days, photos: [{ token: TOKEN_A }] })), /too many photos/);
});

// ---------------------------------------------------------------- property-based

const jsonish = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    fc.string({ maxLength: 40 }),
    fc.integer(),
    fc.double({ noNaN: false }),
    fc.boolean(),
    fc.constant(null),
    fc.array(tie('value'), { maxLength: 4 }),
    fc.dictionary(fc.string({ maxLength: 8 }), tie('value'), { maxKeys: 4 })
  )
})).value;

test('property: any request body is either refused with a message or stored in a safe, bounded shape; it never throws', () => {
  const fieldNames = ['title', 'destination', 'country', 'nights', 'summary', 'photos', 'days', 'inclusions', 'exclusions', 'tags', 'status', '__proto__', 'constructor', '$set'];
  fc.assert(
    fc.property(fc.dictionary(fc.constantFrom(...fieldNames), jsonish, { maxKeys: 8 }), fc.boolean(), (body, partial) => {
      const r = normalizeItineraryInput(body, { partial });
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        assert.ok(r.message.length > 0);
        return;
      }
      const d = r.data;
      assert.deepEqual(Object.keys(d).filter((k) => !['title', 'destination', 'country', 'nights', 'summary', 'photos', 'days', 'inclusions', 'exclusions', 'tags', 'status'].includes(k)), [], 'no unexpected keys');
      if (d.title !== undefined) assert.ok(typeof d.title === 'string' && d.title.length <= LIMITS.title);
      if (d.nights !== undefined) assert.ok(Number.isInteger(d.nights) && d.nights >= 0 && d.nights <= LIMITS.maxNights);
      if (d.days) assert.ok(d.days.length <= LIMITS.maxDays && d.days.every((x) => typeof x.title === 'string' && x.title.length > 0 && Array.isArray(x.photos)));
      if (d.tags) assert.ok(d.tags.length <= LIMITS.tags && new Set(d.tags).size === d.tags.length);
      if (d.status) assert.ok(STATUSES.includes(d.status));
    }),
    { numRuns: 3000 }
  );
});

test('property: script and event handlers never survive into any stored text field', () => {
  const evil = fc.constantFrom('<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<p onclick="x()">', '<a href="javascript:alert(1)">x</a>', '<svg onload=alert(1)>', '<iframe src=//e></iframe>');
  const text = fc.array(fc.oneof(evil, fc.string({ maxLength: 12 }), fc.constantFrom('<p>', '</p>', '<strong>', '</strong>')), { maxLength: 12 }).map((p) => p.join(''));
  fc.assert(
    fc.property(text, text, text, (summary, description, item) => {
      const r = normalizeItineraryInput({ title: 't', destination: 'd', summary, days: [{ title: 'x', description }], inclusions: [item] });
      if (!r.ok) return;
      for (const stored of [r.data.summary, r.data.days[0].description, ...r.data.inclusions]) {
        if (looksLikeHtml(stored)) {
          assert.doesNotMatch(stored, /<\s*(script|img|svg|iframe|a|style|form)\b/i);
          assert.doesNotMatch(stored, /\son[a-z]+\s*=/i);
        }
      }
    }),
    { numRuns: 2000 }
  );
});
