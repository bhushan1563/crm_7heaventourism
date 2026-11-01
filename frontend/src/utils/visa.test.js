import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { STANDARD_DOCUMENTS, addStandardDocuments, applicantCount, blankFee, feeAmount, feesPayload, followGuests, isVisa, startVisa, visaFeeTotal, visaIssue, visaPayload, visaProblem } from './visa';

const visaQuotation = (over = {}) => ({ quotationType: 'Visa', visa: { country: 'United Arab Emirates', applicants: 3 }, visaFees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }], ...over });

describe('fees', () => {
  it('a per-applicant fee is multiplied by the applicants; a group fee is charged once', () => {
    expect(feeAmount({ amount: 6500, per: 'applicant' }, 3)).toBe(19500);
    expect(feeAmount({ amount: 800, per: 'group' }, 3)).toBe(800);
    expect(feeAmount({ amount: '1500.50', per: 'applicant' }, 2)).toBe(3001);
    expect(feeAmount({ amount: 100 }, 0)).toBe(100); // at least one applicant
    expect(feeAmount(blankFee(), 4)).toBe(0);
  });
  it('the total is the sum of the fees, exact to the paisa', () => {
    expect(visaFeeTotal(visaQuotation().visaFees, 3)).toBe(20300);
    expect(visaFeeTotal([], 3)).toBe(0);
    expect(visaFeeTotal(undefined, 3)).toBe(0);
    expect(visaFeeTotal([{ amount: 0.1, per: 'applicant' }, { amount: 0.2, per: 'group' }], 3)).toBe(0.5);
  });
});

describe('applicantCount', () => {
  it('counts every traveller, children included, because everyone needs a visa', () => {
    expect(applicantCount('3 Adults + 1 Child')).toBe(4);
    expect(applicantCount('2 Adults, 2 Children, 1 Infant')).toBe(5);
    expect(applicantCount('4 pax')).toBe(4);
    expect(applicantCount('2 ADULTS + 1 CHILD')).toBe(3);
  });
  it('does not mistake a child\'s age or a date for a head count', () => {
    expect(applicantCount('2 Adults + 1 Child (5 yrs)')).toBe(3);
    expect(applicantCount('2 Adults + 1 Child (age 7)')).toBe(3);
  });
  it('falls back to the first number, and to 1 when there is none', () => {
    expect(applicantCount('5')).toBe(5);
    expect(applicantCount('family of 6')).toBe(6);
    expect(applicantCount('')).toBe(1);
    expect(applicantCount(undefined)).toBe(1);
    expect(applicantCount('a few')).toBe(1);
    expect(applicantCount('0 Adults')).toBe(1);
  });
  it('never goes above the number of applicants a quotation can hold', () => {
    expect(applicantCount('500 Adults')).toBe(99);
    expect(applicantCount('60 Adults + 60 Children')).toBe(99);
  });
});

describe('followGuests', () => {
  const visaQ = (visa, pax) => ({ quotationType: 'Visa', paxDetails: pax, visa });
  it('moves the applicants along with the guests while they still match', () => {
    expect(followGuests(visaQ({ applicants: 1, country: 'France' }, ''), '3 Adults + 1 Child')).toEqual({ visa: { applicants: 4, country: 'France' } });
    expect(followGuests(visaQ({ applicants: 3 }, '3 Adults'), '3 Adults + 1 Child')).toEqual({ visa: { applicants: 4 } });
  });
  it('leaves the applicants alone once they were set by hand', () => {
    expect(followGuests(visaQ({ applicants: 2 }, '3 Adults'), '5 Adults')).toEqual({});
  });
  it('does nothing for other quotation types', () => {
    expect(followGuests({ quotationType: 'Package', paxDetails: '', visa: { applicants: 1 } }, '5 Adults')).toEqual({});
  });
  it('works while typing, character by character', () => {
    let q = visaQ({ applicants: 1 }, '');
    for (const typed of ['3', '3 ', '3 A', '3 Adults', '3 Adults +', '3 Adults + 1', '3 Adults + 1 Child']) {
      q = { ...q, paxDetails: typed, ...followGuests(q, typed) };
    }
    expect(q.visa.applicants).toBe(4);
  });
});

describe('starting a visa quotation', () => {
  it('begins with a visa fee and a service charge to fill in, the applicants taken from the guests, and an EMPTY documents checklist', () => {
    const start = startVisa({ paxDetails: '3 Adults + 1 Child' });
    expect(start.visa.applicants).toBe(4);
    expect(start.visaFees.map((f) => f.label)).toEqual(['Visa fee', 'Service charge']);
    expect(start.visa.country).toBe('');
    expect('visaDocuments' in start).toBe(false);
  });
  it('never replaces what was already typed', () => {
    const start = startVisa({ paxDetails: '9 Adults', visa: { country: 'France', applicants: 2 }, visaFees: [{ label: 'My fee', amount: 5, per: 'group' }] });
    expect(start.visa).toMatchObject({ country: 'France', applicants: 2 });
    expect(start.visaFees).toHaveLength(1);
  });
});

describe('the standard checklist', () => {
  it('adds its lines after the existing ones, without repeating a line that is already there', () => {
    const mine = ['Special form signed by the applicant', '  passport with at least 6 months validity and 2 blank PAGES '];
    const out = addStandardDocuments(mine);
    expect(out.slice(0, 2)).toEqual(mine);
    expect(out).toHaveLength(2 + STANDARD_DOCUMENTS.length - 1);
    expect(addStandardDocuments([])).toEqual(STANDARD_DOCUMENTS);
    expect(addStandardDocuments(undefined)).toEqual(STANDARD_DOCUMENTS);
    expect(addStandardDocuments(out)).toEqual(out); // pressing the button twice adds nothing
  });
  it('never changes the shared standard list itself', () => {
    const copy = [...STANDARD_DOCUMENTS];
    addStandardDocuments(['x']).push('y');
    expect(STANDARD_DOCUMENTS).toEqual(copy);
  });
});

describe('visaProblem', () => {
  it('has nothing to say about other quotation types or a complete visa quotation', () => {
    expect(visaProblem({ quotationType: 'Package' })).toBeNull();
    expect(visaProblem(visaQuotation())).toBeNull();
    expect(isVisa(visaQuotation())).toBe(true);
    expect(isVisa({ quotationType: 'Land Service' })).toBe(false);
  });
  it('asks for the country, sensible applicants and a fee with a name and an amount, naming the fee', () => {
    expect(visaProblem(visaQuotation({ visa: { country: '  ', applicants: 2 } }))).toMatch(/enter the country the visa is for/);
    expect(visaProblem(visaQuotation({ visa: { country: 'UAE', applicants: 0 } }))).toMatch(/number of applicants must be a whole number from 1 to 99/);
    expect(visaProblem(visaQuotation({ visa: { country: 'UAE', applicants: 2.5 } }))).toMatch(/number of applicants/);
    expect(visaProblem(visaQuotation({ visaFees: [] }))).toMatch(/needs at least one fee.*Fees & Services/);
    expect(visaProblem(visaQuotation({ visaFees: [{ label: ' ', amount: 5 }] }))).toBe('Please enter a name for fee 1, or remove that line.');
    expect(visaProblem(visaQuotation({ visaFees: [{ label: 'Visa fee', amount: 5 }, { label: 'Service charge', amount: '' }] }))).toBe('Please enter the amount of "Service charge" (fee 2).');
  });
  it('says which tab holds the problem, so the user is taken there', () => {
    expect(visaIssue(visaQuotation({ visa: { country: '', applicants: 2 } })).tab).toBe('visa');
    expect(visaIssue(visaQuotation({ visa: { country: 'UAE', applicants: 0 } })).tab).toBe('visa');
    expect(visaIssue(visaQuotation({ visaFees: [] })).tab).toBe('visaFees');
    expect(visaIssue(visaQuotation({ visaFees: [{ label: 'x', amount: 0 }] })).tab).toBe('visaFees');
    expect(visaIssue(visaQuotation())).toBeNull();
    expect(visaIssue({ quotationType: 'Package' })).toBeNull();
  });
});

describe('feesPayload', () => {
  it('sends numbers as numbers and tidies the label and the unit', () => {
    expect(feesPayload([{ label: ' Visa fee ', amount: '6500', per: 'applicant' }, { label: 'Courier', amount: '', per: 'anything' }])).toEqual([{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 0, per: 'applicant' }]);
    expect(feesPayload(undefined)).toEqual([]);
  });
  it('sends the applicants as a number and keeps the other visa details', () => {
    expect(visaPayload({ country: 'France', applicants: '4' })).toEqual({ country: 'France', applicants: 4 });
    expect(visaPayload(undefined)).toEqual({ applicants: 1 });
  });
});

describe('property', () => {
  it('the total is never negative and equals the sum of the fees, whatever the fees are', () => {
    const fee = fc.record({ amount: fc.oneof(fc.double({ min: 0, max: 1e6, noNaN: true }), fc.constant(''), fc.constant(undefined)), per: fc.constantFrom('applicant', 'group') });
    fc.assert(
      fc.property(fc.array(fee, { maxLength: 20 }), fc.integer({ min: 1, max: 99 }), (fees, applicants) => {
        const total = visaFeeTotal(fees, applicants);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(Math.abs(total - fees.reduce((s, f) => s + feeAmount(f, applicants), 0))).toBeLessThan(0.01 * fees.length + 0.01);
      }),
      { numRuns: 300 }
    );
  });
});
