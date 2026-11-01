import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ENTRY_TYPES, VISA_LIMITS as L, normalizeQuotationVisa, visaFeeTotal } from '../src/utils/quotationVisa.js';

const ok = (body) => {
  const r = normalizeQuotationVisa(body);
  assert.equal(r.ok, true, r.message);
  return r;
};
const bad = (body) => {
  const r = normalizeQuotationVisa(body);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};
const fee = (over = {}) => ({ label: 'Visa fee', amount: 6500, per: 'applicant', ...over });

test('a request that carries neither visa details nor fees leaves them alone', () => {
  const r = ok({ status: 'Sent' });
  assert.deepEqual([r.visa, r.visaFees, r.total], [undefined, undefined, undefined]);
});

test('visa details are tidied, with sensible defaults for what is missing', () => {
  const r = ok({ visa: { country: ' United  Arab Emirates ', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days', applicants: '4', priceNote: 'Fees as per embassy' } });
  assert.deepEqual(r.visa, { country: 'United Arab Emirates', visaType: 'Tourist', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days', priceNote: 'Fees as per embassy', entryType: 'Single entry', applicants: 4 });
  assert.deepEqual(ok({ visa: {} }).visa, { country: '', visaType: '', mode: '', validity: '', stay: '', processingTime: '', priceNote: '', entryType: '', applicants: 1 });
});

test('fees are tidied; the total is per-applicant fees times the applicants plus the fees for the whole group', () => {
  const r = ok({ visa: { applicants: 3 }, visaFees: [fee(), fee({ label: '  Service   charge ', amount: '1500.456' }), fee({ label: 'Courier', amount: 800, per: 'group' })] });
  assert.deepEqual(r.visaFees.map((f) => [f.label, f.amount, f.per]), [['Visa fee', 6500, 'applicant'], ['Service charge', 1500.46, 'applicant'], ['Courier', 800, 'group']]);
  assert.equal(r.total, 3 * 6500 + 3 * 1500.46 + 800);
  assert.equal(visaFeeTotal([], 4), 0);
  assert.equal(visaFeeTotal(undefined, 4), 0);
  assert.equal(visaFeeTotal([fee({ amount: 100 })], 0), 100, 'at least one applicant');
});

test('the total is only worked out when both the visa details (the applicants) and the fees are sent', () => {
  assert.equal(ok({ visaFees: [fee()] }).total, undefined);
  assert.equal(ok({ visa: { applicants: 2 } }).total, undefined);
  assert.equal(ok({ visa: { applicants: 2 }, visaFees: [] }).total, 0);
});

test('a missing amount is 0 and a missing unit is per applicant', () => {
  const [f] = ok({ visaFees: [{ label: 'Visa fee' }] }).visaFees;
  assert.deepEqual([f.amount, f.per], [0, 'applicant']);
});

test('every problem is explained in plain language and names the fee', () => {
  assert.equal(bad({ visa: 'UAE' }), 'The visa details must be a set of fields.');
  assert.match(bad({ visa: { country: 'x'.repeat(L.text + 1) } }), /country is too long/i);
  assert.match(bad({ visa: { entryType: 'Whenever' } }), /Please choose the entry type from the list/);
  assert.match(bad({ visa: { applicants: 0 } }), /number of applicants must be a whole number from 1 to 99/);
  assert.match(bad({ visa: { applicants: 2.5 } }), /number of applicants/);
  assert.match(bad({ visa: { applicants: 'many' } }), /number of applicants/);
  assert.equal(bad({ visaFees: 'free' }), 'The fees must be a list.');
  assert.match(bad({ visaFees: Array.from({ length: L.fees + 1 }, () => fee()) }), /at most 20 fee lines \(there are 21\)/);
  assert.match(bad({ visaFees: [fee(), 'oops'] }), /^Fee 2 is not valid\./);
  assert.equal(bad({ visaFees: [fee({ label: '  ' })] }), 'Please enter a name for fee 1.');
  assert.match(bad({ visaFees: [fee({ per: 'family' })] }), /Please choose whether fee 1 is per applicant or for the whole group/);
  assert.match(bad({ visaFees: [fee({ amount: -1 })] }), /amount of fee 1 must be from 0 to/);
  assert.match(bad({ visaFees: [fee(), fee({ amount: { $gt: 0 } })] }), /amount of fee 2/);
  assert.match(bad({ visaFees: [fee({ amount: 5e12 })] }), /amount of fee 1/);
});

test('property: whatever arrives, the answer is a clear message or details that obey every limit; the total is right; cleaning twice changes nothing', () => {
  const text = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom('<script>x</script>', '\u0000', 'x'.repeat(300), 'applicant', 'group', ...ENTRY_TYPES), fc.integer({ min: -5, max: 200 }), fc.double({ noNaN: true, min: -10, max: 1e10 }), fc.constant(null));
  const feeArb = fc.record({ label: text, amount: text, per: text }, { requiredKeys: [] });
  const visaArb = fc.record({ country: text, visaType: text, entryType: text, applicants: text, priceNote: text }, { requiredKeys: [] });
  fc.assert(
    fc.property(fc.record({ visa: fc.oneof(text, visaArb), visaFees: fc.oneof(text, fc.array(feeArb, { maxLength: 4 })) }, { requiredKeys: [] }), (body) => {
      const r = normalizeQuotationVisa(body);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      if (r.visa) {
        assert.ok(ENTRY_TYPES.includes(r.visa.entryType));
        assert.ok(Number.isInteger(r.visa.applicants) && r.visa.applicants >= 1 && r.visa.applicants <= L.applicants);
        assert.deepEqual(normalizeQuotationVisa({ visa: r.visa }).visa, r.visa);
      }
      for (const f of r.visaFees || []) {
        assert.ok(f.label.length > 0 && f.label.length <= L.label);
        assert.ok(['applicant', 'group'].includes(f.per));
        assert.ok(Number.isFinite(f.amount) && f.amount >= 0 && f.amount <= L.maxAmount);
      }
      if (r.visaFees) assert.deepEqual(normalizeQuotationVisa({ visaFees: r.visaFees }).visaFees, r.visaFees);
      if (r.total !== undefined) {
        assert.ok(r.total >= 0);
        assert.equal(r.total, visaFeeTotal(r.visaFees, r.visa.applicants));
      }
    }),
    { numRuns: 400 }
  );
});
