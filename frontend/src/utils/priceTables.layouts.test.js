import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LAYOUT_OF_TYPE, ROOM_ROW_LABELS, blankRoomRow, blankTable, filledTables, layoutOf, listPrice, lowestTotal, needsPriceTableChoice, priceTablesPayload, priceTablesProblem, startPriceTables, tableHasData, tableLayout, tableTotal, tablesOf, usesPriceTables } from './priceTables';

// The two layouts of the pricing tables: the sheet for a hotel quotation, the rooms for a package quotation.

const sheetTable = (name = 'Option 1') => ({ name, layout: 'sheet', rows: [{ label: 'Adult', package: 30000, airfare: 12000, visa: 6000, tcs: 1500, pax: 2 }] });
const roomRow = (label, rate, over = {}) => ({ label, rate, nights: '', rooms: '', ...over });
const roomsTable = (name, rows) => ({ name, layout: 'rooms', rows });
const pkg = (over = {}) => ({ quotationType: 'Package', duration: '4 Nights / 5 Days', paxDetails: '2 Adults', priceTables: [roomsTable('3 Star', [roomRow('For 2 Adults', 5000, { rooms: 2 })]), roomsTable('4 Star', [roomRow('For 2 Adults', 8000)])], ...over });
const hotel = (over = {}) => ({ quotationType: 'Only Hotel', priceTables: [sheetTable('3 Star'), sheetTable('4 Star')], ...over });

describe('which layout a kind of quotation uses', () => {
  it('is the sheet for a hotel and the rooms for a package; the other kinds have their own pricing', () => {
    expect(LAYOUT_OF_TYPE).toEqual({ 'Only Hotel': 'sheet', Package: 'rooms' });
    expect(layoutOf({ quotationType: 'Only Hotel' })).toBe('sheet');
    expect(layoutOf({ quotationType: 'Package' })).toBe('rooms');
    expect(layoutOf({})).toBe('rooms'); // a quotation with no kind is a package, as everywhere else
    for (const type of ['Land Service', 'Visa', 'Events / Corporate']) expect(layoutOf({ quotationType: type })).toBeNull();
  });

  it('only counts the tables laid out that way (a table made before there were two layouts is a sheet)', () => {
    expect(tableLayout({ rows: [] })).toBe('sheet');
    expect(tablesOf(hotel({ priceTables: [{ name: 'Old', rows: [] }, roomsTable('R', [])] }))).toHaveLength(1);
    expect(tablesOf(pkg({ priceTables: [sheetTable()] }))).toEqual([]);
    expect(usesPriceTables(pkg({ priceTables: [sheetTable()] }))).toBe(false);
    expect(usesPriceTables(pkg())).toBe(true);
    expect(usesPriceTables({ quotationType: 'Visa', priceTables: [sheetTable()] })).toBe(false);
    expect(usesPriceTables(hotel({ priceTables: [] }))).toBe(false);
  });
});

describe('starting a quotation with its tables', () => {
  it('gives a hotel two sheet options and a package two rooms options, with the rows of the client\'s sheets', () => {
    const h = startPriceTables({ quotationType: 'Only Hotel' });
    expect(h.map((t) => [t.name, t.layout])).toEqual([['Option 1', 'sheet'], ['Option 2', 'sheet']]);
    expect(h[0].rows.map((r) => r.label)).toEqual(['Adult', 'Extra bed', 'CWB', 'CNB']);
    const p = startPriceTables({ quotationType: 'Package' });
    expect(p.map((t) => [t.name, t.layout])).toEqual([['Option 1', 'rooms'], ['Option 2', 'rooms']]);
    expect(p[0].rows.map((r) => r.label)).toEqual(ROOM_ROW_LABELS);
    expect(p[0].rows[0]).toEqual(blankRoomRow('For 2 Adults'));
  });

  it('is named after the hotel options when the quotation already has them (3 Star, 4 Star ...), and nothing for other kinds', () => {
    const t = startPriceTables({ quotationType: 'Only Hotel', options: [{ name: '3 Star Hotels' }, { name: '' }, { name: '4 Star Hotels' }] });
    expect(t.map((x) => x.name)).toEqual(['3 Star Hotels', 'Option 2', '4 Star Hotels']);
    expect(startPriceTables({ quotationType: 'Package', options: [{ name: 'Only one' }] }).map((x) => x.name)).toEqual(['Option 1', 'Option 2']);
    expect(startPriceTables({ quotationType: 'Visa' })).toEqual([]);
  });

  it('starts empty: nothing is filled in, so nothing would print and no choice is asked', () => {
    for (const type of ['Only Hotel', 'Package']) {
      const q = { quotationType: type, priceTables: startPriceTables({ quotationType: type }) };
      expect(filledTables(q)).toEqual([]);
      expect(lowestTotal(q)).toBe(0);
      expect(needsPriceTableChoice(q)).toBe(false);
      expect(listPrice(q)).toEqual({ amount: 0, note: 'Pricing not filled in' });
    }
  });
});

describe('totals', () => {
  it('a rooms option is the rate per room per night x nights x rooms of every row; empty nights follow the trip', () => {
    const q = pkg();
    expect(tableTotal(q.priceTables[0], q)).toBe(5000 * 4 * 2);
    expect(tableTotal(q.priceTables[1], q)).toBe(8000 * 4);
    expect(tableTotal(q.priceTables[1], { duration: '9 Nights / 10 Days' })).toBe(8000 * 9);
    expect(tableTotal(roomsTable('R', [roomRow('x', 1000, { nights: 3, rooms: 2 })]), {})).toBe(6000);
  });

  it('a sheet option is the Final Price of every row, as before', () => {
    expect(tableTotal(sheetTable())).toBe(49500 * 2);
  });

  it('knows when an option has something entered, in either layout', () => {
    expect(tableHasData(sheetTable())).toBe(true);
    expect(tableHasData(roomsTable('R', [roomRow('x', 0)]))).toBe(false);
    expect(tableHasData(roomsTable('R', [roomRow('x', 100)]))).toBe(true);
  });

  it('the list shows "from" the lowest Grand Total, for a package as for a hotel', () => {
    expect(listPrice(pkg())).toEqual({ amount: 32000, note: 'From, 2 options' });
    expect(listPrice(hotel({ priceTables: [sheetTable('A')] }))).toEqual({ amount: 99000, note: 'Grand Total' });
    expect(listPrice({ quotationType: 'Package', priceTables: [] })).toBeNull();
  });

  it('asks which option was accepted only when several have something in them', () => {
    expect(needsPriceTableChoice(pkg())).toBe(true);
    expect(needsPriceTableChoice(pkg({ priceTables: [roomsTable('A', [roomRow('x', 100)]), roomsTable('B', [roomRow('x', 0)])] }))).toBe(false);
    expect(filledTables(pkg({ priceTables: [roomsTable('A', [roomRow('x', 0)]), roomsTable('B', [roomRow('x', 100)])] })).map((f) => f.index)).toEqual([1]); // its number in the whole list
  });
});

describe('what stops saving, in plain words', () => {
  it('names the option and the row for a rooms table', () => {
    const q = (row) => pkg({ priceTables: [roomsTable('3 Star', [row])] });
    expect(priceTablesProblem(q(roomRow('Extra bed', -1)))).toMatch(/rate per room per night of "Extra bed" in 3 Star must be an amount/);
    expect(priceTablesProblem(q(roomRow('Extra bed', 'x')))).toMatch(/must be an amount/);
    expect(priceTablesProblem(q(roomRow('Extra bed', 5, { nights: '1.5' })))).toBe('The number of nights of "Extra bed" in 3 Star must be a whole number from 0 to 365.');
    expect(priceTablesProblem(q(roomRow('Extra bed', 5, { rooms: '-2' })))).toBe('The number of rooms of "Extra bed" in 3 Star must be a whole number from 0 to 999.');
    expect(priceTablesProblem(q(roomRow('  ', 5)))).toBe('Please enter a name for row 1 of 3 Star, or remove that row.');
    expect(priceTablesProblem(q(roomRow('Extra bed', 5, { nights: '3', rooms: '2' })))).toBeNull();
    expect(priceTablesProblem(q(roomRow('Extra bed', 5)))).toBeNull(); // nights and rooms left empty are fine
  });

  it('checks a sheet as before, and nothing for a quotation that does not use the tables', () => {
    expect(priceTablesProblem(hotel({ priceTables: [{ name: 'A', layout: 'sheet', rows: [{ label: 'Adult', package: -5, airfare: '', visa: '', tcs: '', pax: '' }] }] }))).toMatch(/Package of "Adult" in A/);
    expect(priceTablesProblem({ quotationType: 'Visa', priceTables: [roomsTable('A', [roomRow('x', -1)])] })).toBeNull();
    expect(priceTablesProblem(pkg({ priceTables: [] }))).toBeNull();
  });
});

describe('what is sent to the server', () => {
  it('a rooms table keeps its layout and its own figures; nights and rooms left empty stay empty', () => {
    const sent = priceTablesPayload([roomsTable(' 3 Star ', [roomRow(' For 2 Adults ', '5000', { nights: '', rooms: '2' }), roomRow('Extra bed', '1500.5', { nights: '3' })])]);
    expect(sent).toEqual([{ name: '3 Star', layout: 'rooms', rows: [{ label: 'For 2 Adults', rate: 5000, nights: null, rooms: 2 }, { label: 'Extra bed', rate: 1500.5, nights: 3, rooms: null }] }]);
    expect(Object.keys(sent[0].rows[0])).not.toContain('package');
  });

  it('a sheet keeps its own figures and says it is a sheet', () => {
    const sent = priceTablesPayload([{ name: '', rows: [{ label: 'Adult', package: '10', airfare: '', visa: '', tcs: '', pax: '2' }] }]);
    expect(sent[0]).toMatchObject({ name: 'Option 1', layout: 'sheet' });
    expect(Object.keys(sent[0].rows[0]).sort()).toEqual(['airfare', 'label', 'package', 'pax', 'tcs', 'visa']);
  });
});

describe('property', () => {
  it('whatever is typed in a rooms table, the Grand Total is a finite number, never negative, and adding a rate never lowers it', () => {
    const typed = fc.oneof(fc.constant(''), fc.integer({ min: 0, max: 99999 }).map(String));
    const rowArb = fc.record({ label: fc.constant('x'), rate: typed, nights: fc.oneof(fc.constant(''), fc.integer({ min: 0, max: 30 }).map(String)), rooms: fc.oneof(fc.constant(''), fc.integer({ min: 0, max: 10 }).map(String)) });
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 4 }), rowArb, fc.constantFrom('', '3 Nights', '10 Nights / 11 Days'), (rows, extra, duration) => {
        const q = { quotationType: 'Package', duration };
        const before = tableTotal(roomsTable('A', rows), q);
        const after = tableTotal(roomsTable('A', [...rows, extra]), q);
        expect(Number.isFinite(after) && before >= 0 && after >= before).toBe(true);
      }),
      { numRuns: 300 }
    );
  });
});
