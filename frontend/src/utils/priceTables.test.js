import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { blankTable, cellText, filledTables, lowestTotal, priceTablesPayload, priceTablesProblem, rowFinal, rowTotal, startPriceTables, tableHasData, tableTotal, usesPriceTables } from './priceTables';

const row = (label, over = {}) => ({ label, package: 30000, airfare: 12000, visa: 6000, tcs: 1500, pax: 2, ...over });
const hotel = (tables) => ({ quotationType: 'Only Hotel', priceTables: tables });

describe('the arithmetic', () => {
  it('Total is Package + Airfare + Visa + TCS, Final Price is Total x PAX, Grand Total adds the Final Prices (typed text works too)', () => {
    expect(rowTotal(row('Adult'))).toBe(49500);
    expect(rowFinal(row('Adult'))).toBe(99000);
    expect(rowTotal({ package: '1000', airfare: '250.50', visa: '', tcs: undefined })).toBe(1250.5);
    expect(rowFinal({ package: '1000', pax: '3' })).toBe(3000);
    expect(tableTotal({ rows: [row('Adult'), row('CWB', { pax: 1, tcs: 0 }), row('CNB', { pax: 0 })] })).toBe(99000 + 48000);
    expect(tableTotal(undefined)).toBe(0);
    expect(rowTotal({ package: 0.1, airfare: 0.2 })).toBe(0.3);
  });
  it('an option with nothing entered is empty, and the lowest total ignores empty options', () => {
    expect(tableHasData(blankTable('Option 1'))).toBe(false);
    expect(tableHasData({ rows: [row('Adult', { pax: 0, package: 0, airfare: 0, visa: 0, tcs: 0 })] })).toBe(false);
    expect(tableHasData({ rows: [{ label: 'Adult', pax: 1 }] })).toBe(true);
    const q = hotel([blankTable('Option 1'), { name: 'Option 2', rows: [row('Adult')] }, { name: 'Option 3', rows: [row('Adult', { package: 10000 })] }]);
    expect(filledTables(q).map((f) => f.index)).toEqual([1, 2]);
    expect(lowestTotal(q)).toBe(59500 * 1 * 0 + (10000 + 12000 + 6000 + 1500) * 2);
    expect(lowestTotal(hotel([blankTable('Option 1')]))).toBe(0);
    expect(lowestTotal(undefined)).toBe(0);
  });
});

describe('starting', () => {
  it('a new hotel quotation starts with Option 1 and Option 2, each with Adult, Extra bed, CWB and CNB, and never replaces what is there', () => {
    const start = startPriceTables({});
    expect(start.priceTables.map((t) => t.name)).toEqual(['Option 1', 'Option 2']);
    expect(start.priceTables[0].rows.map((r) => r.label)).toEqual(['Adult', 'Extra bed', 'CWB', 'CNB']);
    const mine = [{ name: 'Mine', rows: [row('Adult')] }];
    expect(startPriceTables({ priceTables: mine }).priceTables).toBe(mine);
  });
  it('only a hotel quotation with tables uses them', () => {
    expect(usesPriceTables(hotel([blankTable('Option 1')]))).toBe(true);
    expect(usesPriceTables(hotel([]))).toBe(false);
    expect(usesPriceTables({ quotationType: 'Package', priceTables: [blankTable('Option 1')] })).toBe(false);
    expect(usesPriceTables(undefined)).toBe(false);
  });
  it('an empty cell shows nothing, like the sheet', () => {
    expect(cellText('')).toBe('');
    expect(cellText(0)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(1234567)).toBe('12,34,567');
  });
});

describe('priceTablesProblem', () => {
  it('has nothing to say about a good quotation, or about one that does not use the tables', () => {
    expect(priceTablesProblem(hotel([{ name: 'Option 1', rows: [row('Adult')] }]))).toBeNull();
    expect(priceTablesProblem(hotel([blankTable('Option 1'), blankTable('Option 2')]))).toBeNull();
    expect(priceTablesProblem({ quotationType: 'Package', priceTables: [{ name: 'x', rows: [row('')] }] })).toBeNull();
  });
  it('names the option, the row and the column in plain words', () => {
    expect(priceTablesProblem(hotel([{ name: 'Taj', rows: [row('Adult', { package: -1 })] }]))).toMatch(/^The Package of "Adult" in Taj must be an amount from 0 to Rs 1,00,00,00,000\./);
    expect(priceTablesProblem(hotel([{ name: '', rows: [row('Adult'), row('CWB', { tcs: 'lots' })] }]))).toMatch(/The TCS of "CWB" in Option 1/);
    expect(priceTablesProblem(hotel([{ name: 'A', rows: [row('Adult', { pax: 1.5 })] }]))).toBe('The PAX of "Adult" in A must be a whole number from 0 to 999.');
    expect(priceTablesProblem(hotel([{ name: 'A', rows: [row('Adult', { pax: 1000 })] }]))).toMatch(/PAX of "Adult"/);
    expect(priceTablesProblem(hotel([{ name: 'A', rows: [row('  ')] }]))).toBe('Please enter a name for row 1 of A, or remove that row.');
  });
});

describe('priceTablesPayload', () => {
  it('sends numbers as numbers, tidies the names and gives an empty name its default', () => {
    expect(priceTablesPayload([{ name: ' ', rows: [{ label: ' Adult ', package: '1000', airfare: '', visa: undefined, tcs: '5.5', pax: '2' }] }])).toEqual([{ name: 'Option 1', rows: [{ label: 'Adult', package: 1000, airfare: 0, visa: 0, tcs: 5.5, pax: 2 }] }]);
    expect(priceTablesPayload(undefined)).toEqual([]);
  });
});

describe('property', () => {
  it('whatever is typed, the problem is a message or null, and when there is none the payload adds up the same way', () => {
    const cell = fc.oneof(fc.integer({ min: -5, max: 5000 }), fc.constantFrom('', '12.5', 'abc', ' '), fc.double({ min: 0, max: 1e5, noNaN: true }).map(String));
    const rowArb = fc.record({ label: fc.oneof(fc.string({ maxLength: 10 }), fc.constant('Adult')), package: cell, airfare: cell, visa: cell, tcs: cell, pax: cell });
    fc.assert(
      fc.property(fc.array(fc.record({ name: fc.string({ maxLength: 12 }), rows: fc.array(rowArb, { maxLength: 4 }) }), { minLength: 1, maxLength: 3 }), (tables) => {
        const q = hotel(tables);
        const problem = priceTablesProblem(q);
        expect(problem === null || typeof problem === 'string').toBe(true);
        if (problem === null) {
          const payload = priceTablesPayload(tables);
          payload.forEach((t, i) => expect(Math.abs(tableTotal(t) - tableTotal(tables[i]))).toBeLessThan(0.02 * (t.rows.length + 1)));
        }
      }),
      { numRuns: 300 }
    );
  });
});
