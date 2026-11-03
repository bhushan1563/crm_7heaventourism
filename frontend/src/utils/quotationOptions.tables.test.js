import { describe, expect, it } from 'vitest';
import { blankOption, optionsProblem } from './quotationOptions';
import { startPriceTables } from './priceTables';

// When the pricing tables carry the prices (a hotel quotation: the sheet; a package: per room per night), the options only choose hotels.

const stay = (name = 'Taj') => ({ hotelId: '0123456789abcdef01234567', hotelName: name });
const two = () => [{ ...blankOption(1), hotels: [stay('Taj')] }, { ...blankOption(2), hotels: [stay('Oberoi'), stay('Leela')] }];

describe('options on a quotation priced with the pricing tables', () => {
  it('a hotel quotation with its pricing sheet needs no price under the options', () => {
    const q = { quotationType: 'Only Hotel', options: two() };
    expect(optionsProblem(q)).toMatch(/enter the room rate|price per person/); // without the sheet the old rules ask for a price
    expect(optionsProblem({ ...q, priceTables: startPriceTables(q) })).toBeNull();
  });

  it('a package with its per room per night table needs no price under the options either', () => {
    const q = { quotationType: 'Package', options: two() };
    expect(optionsProblem(q)).toMatch(/price per person of Option 1/);
    expect(optionsProblem({ ...q, priceTables: startPriceTables(q) })).toBeNull();
  });

  it('the hotels are still checked: an option with no hotel, a hand-typed hotel in a hotel quotation, a backwards date', () => {
    const base = { quotationType: 'Only Hotel' };
    const withTables = (options) => ({ ...base, options, priceTables: startPriceTables({ ...base, options }) });
    expect(optionsProblem(withTables([{ ...blankOption(1), hotels: [stay()] }, blankOption(2)]))).toMatch(/Option 2 has no hotel yet/);
    expect(optionsProblem(withTables([{ ...blankOption(1), hotels: [stay()] }, { ...blankOption(2), hotels: [{ hotelName: 'Typed' }] }]))).toMatch(/typed by hand/);
    const backwards = [{ ...blankOption(1), hotels: [{ ...stay(), checkInDate: '2026-03-10', checkOutDate: '2026-03-08' }] }, { ...blankOption(2), hotels: [stay()] }];
    expect(optionsProblem(withTables(backwards))).toMatch(/check-out date must be after the check-in date/);
    expect(optionsProblem(withTables([{ ...blankOption(1), hotels: [stay()] }]))).toMatch(/at least two/);
  });

  it('tables laid out for the other kind of quotation do not count: a package with only a sheet is still priced per person', () => {
    const q = { quotationType: 'Package', options: two() };
    expect(optionsProblem({ ...q, priceTables: startPriceTables({ quotationType: 'Only Hotel' }) })).toMatch(/price per person of Option 1/);
  });

  it('a land service or a visa never uses the tables, so their options are checked as before', () => {
    const q = { quotationType: 'Visa', options: two(), priceTables: startPriceTables({ quotationType: 'Only Hotel' }) };
    expect(optionsProblem(q)).toMatch(/price per person of Option 1/);
  });
});
