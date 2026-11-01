import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { QUOTATION_LIST_LIMITS as L, normalizeQuotationLists } from '../src/utils/quotationLists.js';

const ok = (body) => {
  const r = normalizeQuotationLists(body);
  assert.equal(r.ok, true, r.message);
  return r;
};
const bad = (body) => {
  const r = normalizeQuotationLists(body);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('lines typed the way they have always been (plain text, as the mobile app sends them) are kept exactly', () => {
  const r = ok({ exclusions: ['Monument entry fees', 'Personal expenses <TBC> & tips'], paymentPolicy: ['25% advance at confirmation'], packageDetails: { inclusions: ['Meet & greet', 'Daily breakfast'] } });
  assert.deepEqual(r.lists.exclusions, ['Monument entry fees', 'Personal expenses <TBC> & tips']);
  assert.deepEqual(r.lists.paymentPolicy, ['25% advance at confirmation']);
  assert.deepEqual(r.inclusions, ['Meet & greet', 'Daily breakfast']);
});

test('only the lists the request carries are returned (an update that sends none leaves them all alone)', () => {
  assert.deepEqual(ok({ status: 'Sent' }).lists, {});
  assert.equal(ok({ status: 'Sent' }).inclusions, undefined);
  assert.deepEqual(Object.keys(ok({ vehicleNotes: ['a'] }).lists), ['vehicleNotes']);
  assert.equal(ok({ packageDetails: { hotels: [] } }).inclusions, undefined, 'package details without inclusions do not touch them');
  assert.deepEqual(ok({ exclusions: [] }).lists.exclusions, [], 'an emptied list is a real change');
});

test('formatted lines are cleaned of anything that could run, and keep their formatting', () => {
  const r = ok({ importantNotes: ['<p onclick="x()"><strong>Check-in</strong> at <span style="color:#dc2626;position:fixed">12 noon</span></p><script>alert(1)</script>'] });
  assert.equal(r.lists.importantNotes[0], '<p><strong>Check-in</strong> at <span style="color:#dc2626">12 noon</span></p>');
});

test('blank lines are dropped, and the order of the rest is kept', () => {
  assert.deepEqual(ok({ cancellationPolicy: ['First', '', '   ', '<p></p>', 'Second'] }).lists.cancellationPolicy, ['First', 'Second']);
});

test('every problem is explained in plain language and names the list and the line', () => {
  assert.match(bad({ exclusions: 'not a list' }), /The exclusions must be a list/);
  assert.match(bad({ paymentPolicy: ['ok', 'x'.repeat(L.text + 1)] }), /The payment policy, item 2/);
  assert.match(bad({ packageDetails: { inclusions: 'nope' } }), /The inclusions must be a list/);
  assert.match(bad({ vehicleNotes: Array.from({ length: L.items + 1 }, () => 'x') }), /The vehicle notes can have at most 100 items/);
  assert.match(bad({ packageDetails: { inclusions: ['a', { $ne: 1 }] } }), /The inclusions/);
});

test('property: whatever arrives, the answer is a clear message or lines that are safe and stay the same when cleaned again', () => {
  const line = fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom('<script>x</script>', '<img src=x onerror=1>', '<p>ok</p>', '<p><b>bold</b> <mark style="background-color:#fde047">m</mark></p>', '\u0000', 'x'.repeat(1200)), fc.integer(), fc.constant(null));
  const list = fc.oneof(line, fc.array(line, { maxLength: 5 }));
  fc.assert(
    fc.property(fc.record({ exclusions: list, paymentPolicy: list, cancellationPolicy: list, vehicleNotes: list, importantNotes: list, packageDetails: fc.record({ inclusions: list }) }, { requiredKeys: [] }), (body) => {
      const r = normalizeQuotationLists(body);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      for (const lines of [...Object.values(r.lists), ...(r.inclusions ? [r.inclusions] : [])]) {
        assert.ok(lines.length <= L.items);
        for (const value of lines) {
          assert.equal(typeof value, 'string');
          if (/^\s*<(?:p|ul|ol)[\s>/]/i.test(value)) assert.doesNotMatch(value, /<script|<img|\sonerror=/i);
        }
      }
      const again = normalizeQuotationLists({ ...r.lists, ...(r.inclusions ? { packageDetails: { inclusions: r.inclusions } } : {}) });
      assert.equal(again.ok, true, again.message);
      assert.deepEqual(again.lists, r.lists);
      assert.deepEqual(again.inclusions, r.inclusions);
    }),
    { numRuns: 400 }
  );
});
