import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { MASTER_LIMITS, MASTER_LISTS, normalizeMasterText } from '../src/utils/masterTextInput.js';

// The standard Notes and Policy texts an Admin edits.

const all = (over = {}) => ({ importantNotes: ['Carry a valid ID.'], paymentPolicy: ['25% advance.'], cancellationPolicy: ['30 days: 10%.'], exclusions: ['Airfare.'], vehicleNotes: ['Garage to garage.'], ...over });
const ok = (body) => {
  const r = normalizeMasterText(body);
  assert.equal(r.ok, true, r.message);
  return r.data;
};
const bad = (body) => {
  const r = normalizeMasterText(body);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('all five lists are kept, in order, tidied', () => {
  const d = ok(all({ paymentPolicy: ['  First  ', '<p><strong>Second</strong></p>', '', '   ', 'Third'] }));
  assert.deepEqual(Object.keys(d).sort(), MASTER_LISTS.map(([k]) => k).sort());
  assert.equal(d.paymentPolicy.length, 3, 'blank lines are dropped');
  assert.equal(d.paymentPolicy[1], '<p><strong>Second</strong></p>');
  assert.equal(d.paymentPolicy[2], 'Third');
});

test('a list can be empty on purpose: new quotations then start with none', () => {
  assert.deepEqual(ok(all({ vehicleNotes: [] })).vehicleNotes, []);
});

test('a request that leaves a list out is refused (it would empty that list by accident), naming the list', () => {
  for (const [key, label] of MASTER_LISTS) {
    const body = all();
    delete body[key];
    assert.match(bad(body), new RegExp(`${label} is missing`));
    assert.match(bad(all({ [key]: null })), new RegExp(`${label} is missing`));
  }
});

test('problems are explained in plain words', () => {
  assert.match(bad(all({ exclusions: 'Airfare' })), /exclusions must be a list/);
  assert.match(bad(all({ importantNotes: Array.from({ length: MASTER_LIMITS.items + 1 }, (_, i) => `Note ${i}`) })), /at most 100 items/);
  assert.match(bad(all({ cancellationPolicy: ['x'.repeat(MASTER_LIMITS.text + 1)] })), /cancellation policy, item 1/i);
  assert.match(bad(all({ paymentPolicy: [5] })), /payment policy, item 1/i);
  assert.match(bad(null), /set of lists/);
  assert.match(bad([]), /set of lists/);
  assert.match(bad('x'), /set of lists/);
});

test('script and unsafe markup never get through', () => {
  const d = ok(all({ importantNotes: ['<p onclick="x()">Hello <script>alert(1)</script><a href="javascript:x()">link</a></p>', '<p><img src=x onerror=alert(1)>Safe</p>'] }));
  const text = JSON.stringify(d);
  assert.doesNotMatch(text, /script|onclick|onerror|javascript:|<a |<img/i);
  assert.match(text, /Hello/);
});

test('property: whatever is sent, it never throws, and what is accepted is five lists of text within the limits', () => {
  const lines = fc.array(fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom('', '   ', '<p><strong>x</strong></p>', '<script>1</script>', 5, null, {})), { maxLength: 6 });
  fc.assert(
    fc.property(fc.record({ importantNotes: lines, paymentPolicy: lines, cancellationPolicy: lines, exclusions: lines, vehicleNotes: lines }), (body) => {
      const r = normalizeMasterText(body);
      if (r.ok) {
        for (const [key] of MASTER_LISTS) {
          assert.ok(Array.isArray(r.data[key]) && r.data[key].length <= MASTER_LIMITS.items);
          assert.ok(r.data[key].every((line) => typeof line === 'string' && line.trim().length > 0));
        }
      } else assert.ok(typeof r.message === 'string' && r.message.length > 8);
    }),
    { numRuns: 400 }
  );
  fc.assert(fc.property(fc.anything({ maxDepth: 3 }), (anything) => typeof normalizeMasterText(anything).ok === 'boolean'), { numRuns: 400 });
});
