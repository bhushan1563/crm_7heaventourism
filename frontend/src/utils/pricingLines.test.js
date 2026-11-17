import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { OPTIONAL_MARK, priceListLines } from './pricingLines';

const items = [
  { id: 'pkg', name: 'Package Price', costPerPerson: 25000, note: 'Per person', isIncluded: true },
  { id: 'air', name: 'Airfare', costPerPerson: 5000, note: 'Per person X 6 Adults', isIncluded: true },
  { id: 'oth', name: 'Other', costPerPerson: 0, note: 'Per person', isIncluded: true },
  { id: 'add_1', name: 'Gala dinner', costPerPerson: 1200, note: '', isIncluded: false },
  { id: 'add_2', name: 'Spa', costPerPerson: 0, note: '', isIncluded: false },
  { id: 'add_3', name: '', costPerPerson: 0, note: '', isIncluded: true }
];

describe('priceListLines', () => {
  it('prints every included component, and an optional one that has a price, marked as optional; an empty line and an unpriced option are left out', () => {
    expect(priceListLines({ items }).map((l) => [l.name, l.cost, l.optional])).toEqual([
      ['Package Price', 25000, false],
      ['Airfare', 5000, false],
      ['Other', 0, false], // named, so the person meant it (it prints as it always did)
      ['Gala dinner', 1200, true]
    ]);
    expect(OPTIONAL_MARK).toBe('(optional, not in the total)');
  });

  it('with hotel options only the components on top of the package price count, and only when they have a price', () => {
    expect(priceListLines({ items }, { extrasOnly: true }).map((l) => [l.name, l.cost, l.optional])).toEqual([['Airfare', 5000, false], ['Gala dinner', 1200, true]]);
    expect(priceListLines({ items: [{ id: 'pkg', name: 'Package Price', costPerPerson: 25000 }] }, { extrasOnly: true })).toEqual([]);
  });

  it('keeps the note as typed and reads the price as a number, whatever it was saved as', () => {
    const [line] = priceListLines({ items: [{ id: 'air', name: ' Airfare ', costPerPerson: '5000', note: 'Per person' }] });
    expect(line).toEqual({ name: 'Airfare', cost: 5000, note: 'Per person', optional: false });
  });

  it('is empty for a quotation with no price list at all, and never throws', () => {
    for (const pricing of [undefined, null, {}, { items: null }, { items: 'oops' }, { items: [null, 5, 'x', {}] }]) {
      expect(() => priceListLines(pricing)).not.toThrow();
      expect(priceListLines(pricing, { extrasOnly: true })).toEqual([]);
    }
  });

  it('property: an optional line always has a price, an extra always has a price, and the package price is never an extra', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.constantFrom('pkg', 'air', 'oth', 'add_1', ''),
            name: fc.string({ maxLength: 12 }),
            costPerPerson: fc.oneof(fc.integer({ min: -5, max: 100000 }), fc.constant(undefined), fc.string({ maxLength: 4 })),
            note: fc.string({ maxLength: 8 }),
            isIncluded: fc.constantFrom(true, false, undefined)
          }),
          { maxLength: 8 }
        ),
        (list) => {
          for (const line of priceListLines({ items: list })) if (line.optional) expect(line.cost).toBeGreaterThan(0);
          const extras = priceListLines({ items: list }, { extrasOnly: true });
          for (const line of extras) expect(line.cost).toBeGreaterThan(0);
          const withoutPackage = priceListLines({ items: list.filter((i) => i.id !== 'pkg') }, { extrasOnly: true });
          expect(extras).toEqual(withoutPackage); // taking the package price out changes nothing: it was never an extra
        }
      )
    );
  });
});
