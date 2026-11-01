import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { OPTION_LIMITS, addOption, blankOption, cheapestIndex, duplicateOption, guestCount, hotelsOfFirstOption, moveOption, optionsProblem, removeOption, repriceOptions, setPrice, setRecommended, startOptions } from './quotationOptions';

const stay = (name, over = {}) => ({ hotelName: name, hotelId: '0123456789abcdef01234567', nights: '2 Nights', ...over });
const two = () => [{ ...blankOption(1), hotels: [stay('A')], pricePerPerson: 25000 }, { ...blankOption(2), hotels: [stay('B')], pricePerPerson: 40000 }];

describe('guestCount', () => {
  it('takes the first number, like the pricing tab does, and never less than 1', () => {
    expect(guestCount('3 Adults + 1 Child')).toBe(3);
    expect(guestCount('2 Adults')).toBe(2);
    expect(guestCount('')).toBe(1);
    expect(guestCount(undefined)).toBe(1);
    expect(guestCount('couple')).toBe(1);
    expect(guestCount('0 Adults')).toBe(1);
  });
});

describe('prices', () => {
  it('the total is the price per person times the guests, rounded to the paisa, and follows every change', () => {
    expect(repriceOptions(two(), '3 Adults').map((o) => o.totalPrice)).toEqual([75000, 120000]);
    expect(repriceOptions([{ ...blankOption(1), pricePerPerson: 33.333 }], '3 Adults')[0].totalPrice).toBe(100);
    const changed = setPrice(two(), 1, 45000, '2 Adults');
    expect(changed.map((o) => [o.pricePerPerson, o.totalPrice])).toEqual([[25000, 50000], [45000, 90000]]);
  });
  it('a negative or missing price becomes 0, never a negative total', () => {
    expect(setPrice(two(), 0, -5, '2 Adults')[0]).toMatchObject({ pricePerPerson: 0, totalPrice: 0 });
    expect(setPrice(two(), 0, '', '2 Adults')[0].pricePerPerson).toBe(0);
  });
  it('finds the cheapest option, ignoring those without a price', () => {
    expect(cheapestIndex(two())).toBe(0);
    expect(cheapestIndex([{ ...blankOption(1) }, { ...blankOption(2), pricePerPerson: 9000 }])).toBe(1);
    expect(cheapestIndex([blankOption(1)])).toBe(-1);
    expect(cheapestIndex([])).toBe(-1);
  });
});

describe('starting and ending options', () => {
  it('the hotels already on the quotation become Option 1, and a blank Option 2 is ready', () => {
    const stays = [stay('A'), stay('B')];
    const options = startOptions(stays);
    expect(options.map((o) => o.name)).toEqual(['Option 1', 'Option 2']);
    expect(options[0].hotels.map((h) => h.hotelName)).toEqual(['A', 'B']);
    expect(options[1].hotels).toEqual([]);
    options[0].hotels[0].hotelName = 'changed';
    expect(stays[0].hotelName).toBe('A'); // a copy: editing the option never changes the original list
  });
  it('going back to a single offer keeps the first option\'s hotels', () => {
    expect(hotelsOfFirstOption(two()).map((h) => h.hotelName)).toEqual(['A']);
    expect(hotelsOfFirstOption([])).toEqual([]);
    expect(hotelsOfFirstOption(undefined)).toEqual([]);
  });
});

describe('managing options', () => {
  it('only one option can be recommended', () => {
    let options = setRecommended(two(), 0, true);
    expect(options.map((o) => o.recommended)).toEqual([true, false]);
    options = setRecommended(options, 1, true);
    expect(options.map((o) => o.recommended)).toEqual([false, true]);
    options = setRecommended(options, 1, false);
    expect(options.map((o) => o.recommended)).toEqual([false, false]);
  });
  it('adds, copies, moves and removes, within the limit of six', () => {
    expect(addOption(two()).map((o) => o.name)).toEqual(['Option 1', 'Option 2', 'Option 3']);
    const copied = duplicateOption(setRecommended(two(), 0, true), 0);
    expect(copied.map((o) => o.name)).toEqual(['Option 1', 'Option 1 (copy)', 'Option 2']);
    expect(copied[1].recommended).toBe(false);
    copied[1].hotels[0].hotelName = 'changed';
    expect(copied[0].hotels[0].hotelName).toBe('A');
    expect(moveOption(two(), 0, 1).map((o) => o.name)).toEqual(['Option 2', 'Option 1']);
    expect(moveOption(two(), 0, -1).map((o) => o.name)).toEqual(['Option 1', 'Option 2']);
    expect(removeOption(two(), 0).map((o) => o.name)).toEqual(['Option 2']);
    const full = Array.from({ length: OPTION_LIMITS.options }, (_, i) => blankOption(i + 1));
    expect(addOption(full)).toBe(full);
    expect(duplicateOption(full, 0)).toBe(full);
  });
});

describe('optionsProblem', () => {
  it('has nothing to say about a quotation with no options', () => {
    expect(optionsProblem({ quotationType: 'Only Hotel' })).toBeNull();
    expect(optionsProblem({ options: [] })).toBeNull();
  });
  it('asks for at least two options, a hotel and a price in each, naming the option', () => {
    expect(optionsProblem({ options: [two()[0]] })).toMatch(/add at least two/);
    expect(optionsProblem({ options: [two()[0], { ...blankOption(2), name: 'Premium' }] })).toBe('Option 2 (Premium) has no hotel yet. Choose one from the hotel list, or remove the option.');
    expect(optionsProblem({ options: [two()[0], { ...two()[1], pricePerPerson: 0 }] })).toBe('Please enter the price per person of Option 2.');
    expect(optionsProblem({ options: two() })).toBeNull();
  });
  it('a hotel quotation insists on hotels from the list in every option; other types may type them', () => {
    const typed = [two()[0], { ...two()[1], hotels: [stay('B'), stay('typed', { hotelId: '' })] }];
    expect(optionsProblem({ quotationType: 'Only Hotel', options: typed })).toMatch(/Option 2, hotel 2 was typed by hand.*hotel list/);
    expect(optionsProblem({ quotationType: 'Package', options: typed })).toBeNull();
  });
});

describe('property', () => {
  it('totals always equal price times guests, never negative, and moving or copying never loses an option\'s hotels', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ pricePerPerson: fc.double({ min: 0, max: 1e6, noNaN: true }), n: fc.integer({ min: 0, max: 3 }) }), { minLength: 1, maxLength: 6 }), fc.integer({ min: 1, max: 20 }), fc.nat(5), (rows, guests, at) => {
        const options = rows.map((r, i) => ({ ...blankOption(i + 1), pricePerPerson: r.pricePerPerson, hotels: Array.from({ length: r.n }, (_, k) => stay(`H${i}-${k}`)) }));
        const priced = repriceOptions(options, `${guests} Adults`);
        for (const o of priced) {
          expect(o.totalPrice).toBeGreaterThanOrEqual(0);
          expect(Math.abs(o.totalPrice - o.pricePerPerson * guests)).toBeLessThan(0.01 * guests + 0.01);
        }
        const moved = moveOption(options, at % options.length, (at + 1) % options.length);
        expect(moved.flatMap((o) => o.hotels.map((h) => h.hotelName)).sort()).toEqual(options.flatMap((o) => o.hotels.map((h) => h.hotelName)).sort());
        expect(setRecommended(options, at % options.length, true).filter((o) => o.recommended).length).toBe(1);
      }),
      { numRuns: 300 }
    );
  });
});
