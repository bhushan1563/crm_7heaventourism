import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyVisaItem, emptyVisaItem, feeSummary, formFromVisaItem, groupTotal, hasVisaContent, perApplicantTotal, visaItemPayload, visaItemProblem, visaTitle } from './visaList';

const stored = (over = {}) => ({
  _id: 'v1', country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days', priceNote: 'Fees may change',
  fees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Service charge', amount: 1500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }],
  documents: ['Passport', '<p><strong>Photos</strong></p>'], inclusions: ['Form filling'], notes: 'Ask about Fridays', status: 'Active', ...over
});

describe('the editor state of a visa', () => {
  it('starts with the usual two fee lines and an empty checklist', () => {
    const e = emptyVisaItem();
    expect(e.visaFees.map((f) => f.label)).toEqual(['Visa fee', 'Service charge']);
    expect(e.visaDocuments).toEqual([]);
    expect(e.visa.applicants).toBe(1);
  });
  it('turns a stored visa into the editor state and back into what the server wants, losing nothing', () => {
    const form = formFromVisaItem(stored());
    expect(form.visa).toMatchObject({ country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', priceNote: 'Fees may change', applicants: 1 });
    expect(form.visaFees).toHaveLength(3);
    const payload = visaItemPayload(form);
    expect(payload).toMatchObject({ country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days', priceNote: 'Fees may change', notes: 'Ask about Fridays' });
    expect(payload.fees).toEqual([{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Service charge', amount: 1500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }]);
    expect(payload.documents).toEqual(['Passport', '<p><strong>Photos</strong></p>']);
    expect('applicants' in payload).toBe(false);
  });
  it('copes with a visa that has nothing yet', () => {
    expect(formFromVisaItem(undefined).visaFees).toEqual([]);
    expect(formFromVisaItem({}).visa.country).toBe('');
  });
});

describe('visaItemProblem', () => {
  it('needs a country and named fees with real amounts, in plain words', () => {
    const ok = formFromVisaItem(stored());
    expect(visaItemProblem(ok)).toBeNull();
    expect(visaItemProblem({ ...ok, visa: { ...ok.visa, country: '  ' } })).toBe('Please enter the country this visa is for.');
    expect(visaItemProblem({ ...ok, visaFees: [{ label: ' ', amount: 5, per: 'applicant' }] })).toBe('Please enter a name for fee 1, or remove that line.');
    expect(visaItemProblem({ ...ok, visaFees: [{ label: 'Visa fee', amount: -5, per: 'applicant' }] })).toBe('The amount of "Visa fee" (fee 1) must be a number, 0 or more.');
    expect(visaItemProblem({ ...ok, visaFees: [{ label: 'Visa fee', amount: 'lots', per: 'applicant' }] })).toMatch(/must be a number/);
    expect(visaItemProblem({ ...ok, visaFees: [{ label: 'Visa fee', amount: '', per: 'applicant' }] })).toBeNull();
    expect(visaItemProblem({ ...ok, notes: 'x'.repeat(1001) })).toMatch(/internal notes are too long/);
  });
});

describe('titles and fee summaries', () => {
  it('makes the title a quotation starts with', () => {
    expect(visaTitle({ country: 'United Arab Emirates', visaType: 'Tourist' })).toBe('UNITED ARAB EMIRATES TOURIST VISA');
    expect(visaTitle({ country: 'France' })).toBe('FRANCE VISA');
    expect(visaTitle({ country: ' Sri  Lanka ', visaType: '' })).toBe('SRI LANKA VISA');
  });
  it('sums per-applicant fees and group fees apart, and says so in words', () => {
    const fees = stored().fees;
    expect(perApplicantTotal(fees)).toBe(8000);
    expect(groupTotal(fees)).toBe(800);
    expect(feeSummary(fees)).toBe('Rs 8,000 per applicant + Rs 800 once');
    expect(feeSummary([{ label: 'x', amount: 0, per: 'applicant' }])).toBe('Fees not set');
    expect(feeSummary([])).toBe('Fees not set');
    expect(feeSummary(undefined)).toBe('Fees not set');
    expect(perApplicantTotal([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });
});

describe('putting a visa of the list into a quotation', () => {
  it('takes the details, the checklist, the fees (amounts that are set) and the inclusions, and keeps the quotation\'s own applicants', () => {
    const patch = applyVisaItem({ visa: { applicants: 4, country: 'old' }, visaFees: [], visaDocuments: ['old line'] }, stored());
    expect(patch.visa).toMatchObject({ country: 'United Arab Emirates', visaType: 'Tourist', mode: 'e-Visa', priceNote: 'Fees may change', applicants: 4 });
    expect(patch.visaFees).toEqual([{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Service charge', amount: 1500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }]);
    expect(patch.visaDocuments).toEqual(['Passport', '<p><strong>Photos</strong></p>']);
    expect(patch.visaInclusions).toEqual(['Form filling']);
  });
  it('leaves an amount blank when the list has none, so the person fills it in, and offers the usual fee lines when the list has no fees', () => {
    const patch = applyVisaItem({}, stored({ fees: [{ label: 'Visa fee', amount: 0, per: 'applicant' }] }));
    expect(patch.visaFees).toEqual([{ label: 'Visa fee', amount: '', per: 'applicant' }]);
    expect(applyVisaItem({}, stored({ fees: [] })).visaFees.map((f) => f.label)).toEqual(['Visa fee', 'Service charge']);
    expect(applyVisaItem({}, stored()).visa.applicants).toBe(1);
  });
  it('does not alias the list\'s arrays', () => {
    const item = stored();
    const patch = applyVisaItem({}, item);
    patch.visaDocuments.push('x');
    expect(item.documents).toHaveLength(2);
  });
  it('knows when picking a visa would replace something typed', () => {
    expect(hasVisaContent({})).toBe(false);
    expect(hasVisaContent({ visa: { country: ' ' }, visaFees: [{ label: 'Visa fee', amount: '' }], visaDocuments: [''] })).toBe(false);
    expect(hasVisaContent({ visa: { country: 'UAE' } })).toBe(true);
    expect(hasVisaContent({ visaFees: [{ amount: 100 }] })).toBe(true);
    expect(hasVisaContent({ visaDocuments: ['Passport'] })).toBe(true);
    expect(hasVisaContent({ visaInclusions: ['<p>Form filling</p>'] })).toBe(true);
  });
});

describe('property', () => {
  it('the payload never carries more than the server accepts, whatever was typed, and a problem is a message or null', () => {
    const text = fc.string({ maxLength: 20 });
    fc.assert(
      fc.property(fc.record({ country: text, visaType: text, fee: fc.oneof(text, fc.integer({ min: -3, max: 9999 }).map(String)) }), ({ country, visaType, fee }) => {
        const form = { ...emptyVisaItem(), visa: { ...emptyVisaItem().visa, country, visaType }, visaFees: [{ label: 'Visa fee', amount: fee, per: 'applicant' }] };
        const problem = visaItemProblem(form);
        expect(problem === null || typeof problem === 'string').toBe(true);
        const payload = visaItemPayload(form);
        expect(payload.country).toBe(country.trim());
        expect(payload.fees.every((f) => Number.isFinite(f.amount))).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
