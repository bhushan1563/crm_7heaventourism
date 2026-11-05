import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_TEXT, STANDARD_TEXT_KEYS, isMissingStandardText, withStandardText } from '../src/utils/standardText.js';

// A quotation brought in from the old export has none of the five lists of standard text. It is given them, so it opens, copies and confirms
// like a quotation made in the app. One that has any of them written is never touched.

const legacy = () => ({ quotationNo: 'OLD-1', clientName: 'Aarav', destination: 'Goa', exclusions: [], paymentPolicy: [], cancellationPolicy: [], importantNotes: [], vehicleNotes: [], packageDetails: { inclusions: [] } });

test('a quotation with none of the five lists is the old kind', () => {
  assert.equal(isMissingStandardText(legacy()), true);
  assert.equal(isMissingStandardText({ quotationNo: 'X' }), true, 'lists that are not there at all count as empty');
  assert.equal(isMissingStandardText({ ...legacy(), exclusions: ['  ', ''] }), true, 'blank lines are nothing');
  assert.equal(isMissingStandardText({ ...legacy(), exclusions: ['No airfare'] }), false);
  assert.equal(isMissingStandardText(null), false);
});

test('it is given the built-in standard text when the company has saved none', () => {
  const q = withStandardText(legacy(), null);
  for (const key of STANDARD_TEXT_KEYS) assert.deepEqual(q[key], STANDARD_TEXT[key], key);
  assert.equal(q.clientName, 'Aarav', 'everything else stays');
  assert.deepEqual(q.packageDetails, { inclusions: [] }, 'what the trip includes is not made up');
  q.exclusions.push('x');
  assert.ok(!STANDARD_TEXT.exclusions.includes('x'), 'the built-in text is copied, not shared');
});

test('the text the company saved wins, list by list, and a list it left out uses the built-in text', () => {
  const master = { importantNotes: ['Carry your ID.'], paymentPolicy: ['50% now, 50% later.'], cancellationPolicy: [], exclusions: undefined, vehicleNotes: ['  '] };
  const q = withStandardText(legacy(), master);
  assert.deepEqual(q.importantNotes, ['Carry your ID.']);
  assert.deepEqual(q.paymentPolicy, ['50% now, 50% later.']);
  assert.deepEqual(q.cancellationPolicy, STANDARD_TEXT.cancellationPolicy);
  assert.deepEqual(q.exclusions, STANDARD_TEXT.exclusions);
  assert.deepEqual(q.vehicleNotes, STANDARD_TEXT.vehicleNotes);
});

test('a quotation that has any of the lists written is left exactly as it is', () => {
  const mine = { ...legacy(), importantNotes: ['Only this one'] };
  assert.equal(withStandardText(mine, { exclusions: ['Other'] }), mine);
  assert.deepEqual(mine.exclusions, []);
});
