import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { normalizeSenderNumber } from '../src/utils/senderNumber.js';

const ok = (raw) => {
  const r = normalizeSenderNumber(raw);
  assert.equal(r.ok, true, r.message);
  return r.value;
};
const bad = (raw) => {
  const r = normalizeSenderNumber(raw);
  assert.equal(r.ok, false, `"${raw}" should be refused`);
  assert.ok(r.message.length > 10);
  return r.message;
};

test('nothing typed clears the number', () => {
  for (const nothing of [undefined, null, '', '   ']) assert.equal(ok(nothing), '');
});

test('the usual ways of typing a number all give the same canonical number', () => {
  for (const typed of ['9876543210', '98765 43210', '098765 43210', '+91 98765-43210', '0091 (98765) 43210', '919876543210', ' +91.98765.43210 ', 9876543210]) {
    assert.equal(ok(typed), '+919876543210', String(typed));
  }
  assert.equal(ok('+971 50 123 4567'), '+971501234567');
  assert.equal(ok('+1 (415) 555-2671'), '+14155552671');
});

test('a number that cannot be right is refused in plain words', () => {
  assert.match(bad('98765'), /too short/);
  assert.match(bad('+91 123'), /too short/);
  assert.match(bad('9876543210123456789'), /too long/);
  assert.match(bad('call me'), /only have digits/);
  assert.match(bad('98765x43210'), /only have digits/);
  assert.match(bad('0000000000'), /country code never starts with 0/);
  assert.match(bad('0987654321'), /should not start with 0/);
  assert.match(bad('9'.repeat(41)), /too long/);
  assert.match(bad({ $ne: '' }), /must be text/);
  assert.match(bad(['9876543210']), /must be text/);
});

test('scripts, links and query fragments are never numbers', () => {
  for (const hostile of ['<script>alert(1)</script>', 'https://evil.example/?x=1', '1; DROP TABLE users', '9876543210/../../x', '+91 98765 43210 ext 5']) bad(hostile);
});

test('property: whatever is typed it never throws, and what is accepted is "+" and 8 to 15 digits not starting with 0', () => {
  fc.assert(
    fc.property(fc.oneof(fc.string({ maxLength: 50 }), fc.array(fc.constantFrom(...'0123456789 +-().'), { maxLength: 24 }).map((a) => a.join(''))), (typed) => {
      const r = normalizeSenderNumber(typed);
      assert.equal(typeof r.ok, 'boolean');
      if (r.ok && r.value) assert.match(r.value, /^\+[1-9]\d{7,14}$/);
      if (!r.ok) assert.ok(r.message.length > 10);
    }),
    { numRuns: 400 }
  );
});

test('property: what was saved is accepted again as it is (saving twice changes nothing)', () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom(...'0123456789 +-().'), { maxLength: 24 }).map((a) => a.join('')), (typed) => {
      const first = normalizeSenderNumber(typed);
      if (first.ok) assert.deepEqual(normalizeSenderNumber(first.value), first);
    }),
    { numRuns: 400 }
  );
});

test('property: any ten digits (not starting with 0) are an Indian number', () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom(...'0123456789'), { minLength: 10, maxLength: 10 }).map((a) => a.join('')).filter((t) => !t.startsWith('0')), (ten) => {
      assert.equal(normalizeSenderNumber(ten).value, `+91${ten}`);
    })
  );
});
