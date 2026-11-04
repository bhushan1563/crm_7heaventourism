import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { autoPriceNote, nextPriceNote, shownPriceNote } from './pricingNote';

describe('the price line', () => {
  it('is written in the usual words, with Indian digit grouping', () => {
    expect(autoPriceNote(43000)).toBe('Rs 43,000 Per person (Incl of GST)');
    expect(autoPriceNote(1234567)).toBe('Rs 12,34,567 Per person (Incl of GST)');
    expect(autoPriceNote(0)).toBe('Rs 0 Per person (Incl of GST)');
    expect(autoPriceNote(undefined)).toBe('Rs 0 Per person (Incl of GST)');
  });

  it('follows the price while it is still the automatic text, or empty', () => {
    expect(nextPriceNote(autoPriceNote(40000), 40000, 45000)).toBe(autoPriceNote(45000));
    expect(nextPriceNote('', 0, 45000)).toBe(autoPriceNote(45000));
    expect(nextPriceNote(undefined, 0, 45000)).toBe(autoPriceNote(45000));
    expect(nextPriceNote('  ', 0, 45000)).toBe(autoPriceNote(45000));
    expect(nextPriceNote(autoPriceNote(0), 123, 45000)).toBe(autoPriceNote(45000));
  });

  it('is never overwritten once someone wrote or formatted their own', () => {
    expect(nextPriceNote('Special festival rate: Rs 40,000 per person', 40000, 45000)).toBe('Special festival rate: Rs 40,000 per person');
    const formatted = '<p><strong>Rs 40,000</strong> per person</p>';
    expect(nextPriceNote(formatted, 40000, 45000)).toBe(formatted);
    expect(nextPriceNote(autoPriceNote(99999), 40000, 45000)).toBe(autoPriceNote(99999)); // an automatic line for a different price was edited by hand
  });

  it('property: the result is either the automatic line for the new price or exactly what was there', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 40 }), fc.constant(undefined), fc.integer({ min: 0, max: 99999 }).map(autoPriceNote)), fc.integer({ min: 0, max: 99999 }), fc.integer({ min: 0, max: 99999 }), (current, before, after) => {
        const next = nextPriceNote(current, before, after);
        expect([autoPriceNote(after), current]).toContain(next);
      }),
      { numRuns: 300 }
    );
  });
});

describe('shownPriceNote: the price line that is printed', () => {
  const pricing = (over) => ({ totalCostPerPerson: 48800, grandTotal: 195200, totalCostNote: 'Rs 0 Per person (Incl of GST)', ...over });
  it('replaces an automatic line that disagrees with the price (the default of every imported quotation)', () => {
    expect(shownPriceNote(pricing())).toBe('Rs 48,800 Per person (Incl of GST)');
    expect(shownPriceNote(pricing({ totalCostNote: '<p>Rs 0 Per person (Incl of GST)</p>' }))).toBe('Rs 48,800 Per person (Incl of GST)');
    expect(shownPriceNote(pricing({ totalCostNote: '' }))).toBe('Rs 48,800 Per person (Incl of GST)');
  });
  it('keeps a line that agrees, and any line somebody wrote', () => {
    expect(shownPriceNote(pricing({ totalCostNote: 'Rs 48,800 Per person (Incl of GST)' }))).toBe('Rs 48,800 Per person (Incl of GST)');
    expect(shownPriceNote(pricing({ totalCostNote: '<p><strong>Special offer: Rs 45,000 Per person</strong></p>' }))).toBe('<p><strong>Special offer: Rs 45,000 Per person</strong></p>');
    expect(shownPriceNote(pricing({ totalCostNote: 'From Rs 20,000' }))).toBe('From Rs 20,000');
  });
  it('with no per-person price it falls back to the total, then to "on request"', () => {
    expect(shownPriceNote(pricing({ totalCostPerPerson: 0 }))).toBe('Rs 1,95,200 Total (Incl of GST)');
    expect(shownPriceNote(pricing({ totalCostPerPerson: 0, grandTotal: 0 }))).toBe('Custom Rate on Request');
    expect(shownPriceNote(null)).toBe('Custom Rate on Request');
  });
});
