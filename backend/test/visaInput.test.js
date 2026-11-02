import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { VISA_ITEM_LIMITS, normalizeVisaInput, visaNameKey } from '../src/utils/visaInput.js';

const ok = (body, options) => {
  const r = normalizeVisaInput(body, options);
  assert.equal(r.ok, true, r.message);
  return r.data;
};
const bad = (body, options) => {
  const r = normalizeVisaInput(body, options);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};
const full = (over = {}) => ({
  country: ' United  Arab Emirates ', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days', priceNote: '<p><strong>Fees may change</strong></p>',
  fees: [{ label: 'Visa fee', amount: '6500', per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }],
  documents: ['Passport valid for 6 months', '<p onclick="x()"><strong>Photos</strong></p><script>x</script>'], inclusions: ['Form filling'], notes: 'Ask the embassy about Fridays', ...over
});

test('a complete visa is tidied: details, fees, checklist and inclusions', () => {
  const d = ok(full());
  assert.deepEqual([d.country, d.visaType, d.entryType, d.mode, d.validity, d.stay, d.processingTime], ['United Arab Emirates', 'Tourist', 'Single entry', 'e-Visa', '60 days', '30 days', '3 to 5 working days']);
  assert.equal(d.priceNote, '<p><strong>Fees may change</strong></p>');
  assert.deepEqual(d.fees, [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }]);
  assert.deepEqual(d.documents, ['Passport valid for 6 months', '<p><strong>Photos</strong></p>']);
  assert.deepEqual(d.inclusions, ['Form filling']);
  assert.equal(d.notes, 'Ask the embassy about Fridays');
  assert.equal('applicants' in d, false, 'a visa in the list has no number of applicants: that belongs to a quotation');
});

test('the country is needed, in plain words', () => {
  assert.equal(bad({}), 'Please enter the country this visa is for.');
  assert.equal(bad(full({ country: '   ' })), 'Please enter the country this visa is for.');
  assert.equal(bad({ country: 'x'.repeat(200) }).includes('too long'), true);
});

test('every problem is explained in plain words', () => {
  assert.match(bad(full({ entryType: 'Whenever' })), /Please choose the entry type from the list/);
  assert.match(bad(full({ fees: [{ label: '', amount: 1 }] })), /Please enter a name for fee 1/);
  assert.match(bad(full({ fees: [{ label: 'A', amount: -1 }] })), /amount of fee 1 must be from 0 to/);
  assert.match(bad(full({ fees: [{ label: 'A', amount: 1, per: 'family' }] })), /fee 1 is per applicant or for the whole group/);
  assert.match(bad(full({ fees: 'free' })), /The fees must be a list/);
  assert.match(bad(full({ documents: ['ok', 'x'.repeat(1500)] })), /The documents checklist, item 2/);
  assert.match(bad(full({ notes: 'x'.repeat(VISA_ITEM_LIMITS.notes + 1) })), /internal notes is too long/i);
  assert.match(bad(full({ status: 'Deleted' })), /status must be Active or Archived/);
  assert.match(bad(full({ notes: { $ne: 1 } })), /must be text/);
});

test('an update carries only what changed: archiving sends only the status, and nothing else is touched', () => {
  assert.deepEqual(ok({ status: 'Archived' }, { partial: true }), { status: 'Archived' });
  assert.deepEqual(ok({}, { partial: true }), {});
  assert.deepEqual(ok({ validity: ' 90 days ' }, { partial: true }), { validity: '90 days' });
  assert.deepEqual(ok({ fees: [] }, { partial: true }), { fees: [] }, 'an emptied list is a real change');
  assert.deepEqual(ok({ documents: [] }, { partial: true }), { documents: [] });
  assert.equal(bad({ country: ' ' }, { partial: true }), 'Please enter the country this visa is for.');
});

test('the same visa is the same however it is typed', () => {
  assert.equal(visaNameKey('  United   Arab Emirates', 'TOURIST', 'Single entry'), visaNameKey('united arab emirates', 'tourist', 'single entry'));
  assert.notEqual(visaNameKey('UAE', 'Tourist', 'Single entry'), visaNameKey('UAE', 'Tourist', 'Multiple entry'));
  assert.notEqual(visaNameKey('UAE', 'Tourist', ''), visaNameKey('UAE', 'Business', ''));
  assert.equal(visaNameKey(undefined, null, undefined), '||');
});

test('property: whatever arrives, the answer is a clear message or data that obeys the rules; cleaning twice changes nothing', () => {
  const text = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom('<script>x</script>', '', 'x'.repeat(300), 'Single entry'), fc.integer(), fc.constant(null));
  const fee = fc.record({ label: text, amount: text, per: text }, { requiredKeys: [] });
  fc.assert(
    fc.property(
      fc.record({ country: text, visaType: text, entryType: text, mode: text, notes: text, fees: fc.oneof(text, fc.array(fee, { maxLength: 3 })), documents: fc.oneof(text, fc.array(text, { maxLength: 3 })) }, { requiredKeys: [] }),
      fc.boolean(),
      (body, partial) => {
        const r = normalizeVisaInput(body, { partial });
        if (!r.ok) {
          assert.equal(typeof r.message, 'string');
          return;
        }
        if (r.data.country !== undefined) assert.ok(r.data.country.length > 0 && r.data.country.length <= 100);
        for (const f of r.data.fees || []) assert.ok(f.label.length > 0 && f.amount >= 0 && ['applicant', 'group'].includes(f.per));
        const again = normalizeVisaInput(r.data, { partial: true });
        assert.equal(again.ok, true, again.message);
        assert.deepEqual(again.data, r.data);
      }
    ),
    { numRuns: 300 }
  );
});
