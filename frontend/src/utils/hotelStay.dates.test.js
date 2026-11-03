import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addressLine, blankStay, nightsBetween, nightsText, stayDatePatch } from './hotelStay';
import { blankOption, optionsProblem } from './quotationOptions';

// The check-in and check-out dates of a hotel in an option: the nights follow them, and a check-out that is not after the check-in is refused.

describe('nightsBetween', () => {
  it('counts the nights between two dates, from the plain date or from saved ISO text', () => {
    expect(nightsBetween('2026-03-07', '2026-03-10')).toBe(3);
    expect(nightsBetween('2026-03-07T00:00:00.000Z', '2026-03-08T00:00:00.000Z')).toBe(1);
    expect(nightsBetween('2026-02-27', '2026-03-02')).toBe(3); // across the end of February
    expect(nightsBetween('2028-02-27', '2028-03-02')).toBe(4); // a leap year
    expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3); // across the new year
  });

  it('is 0 when a date is missing, the same day, or backwards: there is nothing to count', () => {
    expect(nightsBetween('', '2026-03-10')).toBe(0);
    expect(nightsBetween('2026-03-07', '')).toBe(0);
    expect(nightsBetween(undefined, null)).toBe(0);
    expect(nightsBetween('2026-03-07', '2026-03-07')).toBe(0);
    expect(nightsBetween('2026-03-10', '2026-03-07')).toBe(0);
    expect(nightsBetween('soon', 'later')).toBe(0);
  });
});

describe('addressLine', () => {
  it('puts the city after the address, but never says the city twice', () => {
    expect(addressLine({ address: '12 Lake Road', city: 'Udaipur' })).toBe('12 Lake Road, Udaipur');
    expect(addressLine({ address: 'Pichola, Udaipur 313001', city: 'Udaipur' })).toBe('Pichola, Udaipur 313001');
    expect(addressLine({ address: 'Pichola, UDAIPUR', city: 'udaipur' })).toBe('Pichola, UDAIPUR'); // whatever the capitals
  });
  it('copes with a missing address or city', () => {
    expect(addressLine({ address: '', city: 'Udaipur' })).toBe('Udaipur');
    expect(addressLine({ address: '12 Lake Road', city: '' })).toBe('12 Lake Road');
    expect(addressLine({ address: '  ', city: '  ' })).toBe('');
    expect(addressLine(undefined)).toBe('');
  });
  it('property: it always keeps the whole address, and names the city exactly when the address did not', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9 ,.]{0,30}$/), fc.stringMatching(/^[A-Za-z]{0,12}$/), (address, city) => {
        const out = addressLine({ address, city });
        if (address.trim()) expect(out.includes(address.trim())).toBe(true);
        if (city.trim()) expect(out.toLowerCase().includes(city.trim().toLowerCase())).toBe(true);
      }),
      { numRuns: 300 }
    );
  });
});

describe('nightsText', () => {
  it('says Night for one and Nights for more, the way the nights are written everywhere else', () => {
    expect(nightsText(1)).toBe('1 Night');
    expect(nightsText(3)).toBe('3 Nights');
  });
});

describe('stayDatePatch', () => {
  it('sets the date, and the nights as soon as both dates make sense', () => {
    const stay = { ...blankStay(), nights: '1 Night' };
    expect(stayDatePatch(stay, 'checkInDate', '2026-03-07')).toEqual({ checkInDate: '2026-03-07' }); // one date only: nights untouched
    const withIn = { ...stay, checkInDate: '2026-03-07' };
    expect(stayDatePatch(withIn, 'checkOutDate', '2026-03-10')).toEqual({ checkOutDate: '2026-03-10', nights: '3 Nights' });
    const both = { ...stay, checkInDate: '2026-03-07', checkOutDate: '2026-03-10' };
    expect(stayDatePatch(both, 'checkInDate', '2026-03-08')).toEqual({ checkInDate: '2026-03-08', nights: '2 Nights' });
    expect(stayDatePatch(both, 'checkOutDate', '2026-03-08')).toEqual({ checkOutDate: '2026-03-08', nights: '1 Night' });
  });

  it('leaves the nights alone when the dates are backwards or cleared, so what was typed by hand is not lost', () => {
    const both = { ...blankStay(), nights: '5 Nights', checkInDate: '2026-03-07', checkOutDate: '2026-03-12' };
    expect(stayDatePatch(both, 'checkOutDate', '2026-03-01')).toEqual({ checkOutDate: '2026-03-01' });
    expect(stayDatePatch(both, 'checkOutDate', '')).toEqual({ checkOutDate: '' });
  });
});

describe('optionsProblem: the dates of a hotel in an option', () => {
  const stay = (over = {}) => ({ hotelName: 'A', hotelId: '0123456789abcdef01234567', nights: '2 Nights', ...over });
  const options = (first) => [{ ...blankOption(1), hotels: [first], pricePerPerson: 25000 }, { ...blankOption(2), hotels: [stay()], pricePerPerson: 40000 }];

  it('refuses a check-out that is not after the check-in, and says which hotel', () => {
    expect(optionsProblem({ quotationType: 'Only Hotel', options: options(stay({ checkInDate: '2026-03-10', checkOutDate: '2026-03-07' })) })).toBe('Option 1, hotel 1: the check-out date must be after the check-in date.');
    expect(optionsProblem({ quotationType: 'Only Hotel', options: options(stay({ checkInDate: '2026-03-10', checkOutDate: '2026-03-10' })) })).toMatch(/check-out date must be after/);
  });

  it('accepts good dates, one date, and no dates', () => {
    expect(optionsProblem({ quotationType: 'Only Hotel', options: options(stay({ checkInDate: '2026-03-07', checkOutDate: '2026-03-10' })) })).toBeNull();
    expect(optionsProblem({ quotationType: 'Only Hotel', options: options(stay({ checkInDate: '2026-03-07' })) })).toBeNull();
    expect(optionsProblem({ quotationType: 'Only Hotel', options: options(stay()) })).toBeNull();
  });
});

describe('property', () => {
  const day = fc.integer({ min: 0, max: 3000 }).map((n) => new Date(Date.UTC(2024, 0, 1) + n * 86400000).toISOString().slice(0, 10));

  it('the nights are exactly the number of days from check-in to check-out, and never negative', () => {
    fc.assert(
      fc.property(day, day, (a, b) => {
        const n = nightsBetween(a, b);
        expect(n).toBeGreaterThanOrEqual(0);
        const days = Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
        expect(n).toBe(days > 0 ? days : 0);
        if (n > 0) expect(nightsBetween(a, b)).toBe(nightsBetween(`${a}T00:00:00.000Z`, `${b}T00:00:00.000Z`));
      }),
      { numRuns: 500 }
    );
  });

  it('typing the dates in either order gives the same nights', () => {
    fc.assert(
      fc.property(day, day, (a, b) => {
        fc.pre(nightsBetween(a, b) > 0);
        const s0 = blankStay();
        const inFirst = { ...s0, ...stayDatePatch(s0, 'checkInDate', a) };
        const one = { ...inFirst, ...stayDatePatch(inFirst, 'checkOutDate', b) };
        const outFirst = { ...s0, ...stayDatePatch(s0, 'checkOutDate', b) };
        const two = { ...outFirst, ...stayDatePatch(outFirst, 'checkInDate', a) };
        expect(one.nights).toBe(two.nights);
        expect(one.nights).toBe(nightsText(nightsBetween(a, b)));
      }),
      { numRuns: 300 }
    );
  });
});
