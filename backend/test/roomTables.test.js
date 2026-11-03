import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { ROOM_ROW_LABELS, ROOM_TABLE_LIMITS, numberIn, roomDefaults, roomRowNights, roomRowRooms, roomRowTotal, roomTableHasData, roomTableTotal } from '../src/utils/roomTables.js';
import { LAYOUT_OF_TYPE, TABLE_LAYOUTS, normalizeQuotationPriceTables, tableHasData, tableTotal } from '../src/utils/quotationPriceTables.js';
import { confirmationFromQuotation } from '../src/utils/confirmationSnapshot.js';
import * as browserSide from '../../frontend/src/utils/roomTables.js';

// The "rooms" layout of a pricing table (the client's second sheet): rate per room per night x nights x rooms, and a Grand Total.

const row = (label, rate, over = {}) => ({ label, rate, nights: null, rooms: null, ...over });
const table = (name, rows) => ({ name, layout: 'rooms', rows });
const trip = { duration: '5 Nights / 6 Days' };

test('a row is the rate per room per night times the nights times the rooms', () => {
  assert.equal(roomRowTotal(row('For 2 Adults', 5000, { nights: 3, rooms: 2 })), 30000);
  assert.equal(roomRowTotal(row('Extra bed', 1500, { nights: 3 })), 4500, 'rooms left empty is one');
  assert.equal(roomRowTotal(row('Child No Bed', 800, { nights: 3, rooms: 0 })), 0, 'a typed zero is a real zero');
});

test('nights left empty follow the length of the trip; rooms left empty are one', () => {
  const defaults = roomDefaults(trip);
  assert.deepEqual(defaults, { nights: 5 });
  assert.equal(roomRowNights(row('x', 1), defaults), 5);
  assert.equal(roomRowNights(row('x', 1, { nights: 2 }), defaults), 2);
  assert.equal(roomRowRooms(row('x', 1)), 1);
  assert.equal(roomRowTotal(row('For 2 Adults', 5000), defaults), 25000);
  assert.equal(roomRowTotal(row('For 2 Adults', 5000), roomDefaults({})), 0, 'a trip with no length gives no total until the nights are typed');
  assert.equal(numberIn('Day trip'), 0);
  assert.equal(numberIn('10 Nights / 11 Days'), 10);
});

test('the Grand Total is every row added up; a table with no rate is empty', () => {
  const t = table('Option 1', [row('For 2 Adults', 5000, { rooms: 2 }), row('Extra bed', 1500), row('Child With bed', 0)]);
  assert.equal(roomTableTotal(t, roomDefaults(trip)), 50000 + 7500);
  assert.equal(roomTableHasData(t), true);
  assert.equal(roomTableHasData(table('Option 2', [row('For 2 Adults', 0)])), false);
  assert.equal(roomTableTotal(undefined, roomDefaults(trip)), 0);
});

test('amounts are rounded to paise', () => {
  assert.equal(roomRowTotal(row('x', 1999.99, { nights: 3, rooms: 1 })), 5999.97);
});

test('the layout of a kind of quotation: hotels use the sheet, packages use the rooms; the others have their own pricing', () => {
  assert.deepEqual(LAYOUT_OF_TYPE, { 'Only Hotel': 'sheet', Package: 'rooms' });
  assert.deepEqual(TABLE_LAYOUTS, ['sheet', 'rooms']);
  assert.deepEqual(ROOM_ROW_LABELS, ['For 2 Adults', 'Extra bed', 'Child With bed', 'Child No Bed']);
});

// ---------------------------------------- the server's check of what the browser sends ----------------------------------------

const ok = (value) => {
  const r = normalizeQuotationPriceTables(value);
  assert.equal(r.ok, true, r.message);
  return r.value;
};
const bad = (value) => {
  const r = normalizeQuotationPriceTables(value);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('rooms rows are kept as sent: nights and rooms empty while they follow the trip', () => {
  const [t] = ok([{ name: ' 3  Star ', layout: 'rooms', rows: [{ label: 'For 2 Adults', rate: '5000.456', nights: '', rooms: undefined }, { label: 'Extra bed', rate: 1500, nights: 2, rooms: 1 }] }]);
  assert.deepEqual(t, { name: '3 Star', layout: 'rooms', rows: [{ label: 'For 2 Adults', rate: 5000.46, nights: null, rooms: null }, { label: 'Extra bed', rate: 1500, nights: 2, rooms: 1 }] });
});

test('a table with no layout is the sheet, as every table made before was', () => {
  assert.equal(ok([{ name: 'A', rows: [] }])[0].layout, 'sheet');
  assert.equal(ok([{ name: 'A', layout: null, rows: [] }])[0].layout, 'sheet');
});

test('problems with a rooms table are explained in plain words and name the option and the row', () => {
  assert.match(bad([{ name: 'A', layout: 'grid', rows: [] }]), /A must be laid out as the sheet or as rooms/);
  assert.match(bad([{ name: 'A', layout: 'rooms', rows: [{ label: 'Extra bed', rate: -1 }] }]), /rate per room per night of "Extra bed" in A must be an amount from 0 to Rs 1,00,00,000/);
  assert.match(bad([{ name: 'A', layout: 'rooms', rows: [{ label: 'Extra bed', rate: 'lots' }] }]), /must be an amount/);
  assert.match(bad([{ name: 'A', layout: 'rooms', rows: [{ label: 'Extra bed', rate: 1, nights: 1.5 }] }]), /number of nights of "Extra bed" in A must be a whole number from 0 to 365/);
  assert.match(bad([{ name: 'A', layout: 'rooms', rows: [{ label: 'Extra bed', rate: 1, nights: 366 }] }]), /from 0 to 365/);
  assert.match(bad([{ name: 'A', layout: 'rooms', rows: [{ label: 'Extra bed', rate: 1, rooms: -1 }] }]), /number of rooms of "Extra bed" in A must be a whole number from 0 to 999/);
  assert.match(bad([{ name: 'A', layout: 'rooms', rows: [{ label: '', rate: 1 }] }]), /Please enter a name for row 1 of A/);
  assert.match(bad([{ name: 'A', layout: 'rooms', rows: Array.from({ length: 11 }, () => row('x', 1)) }]), /at most 10 rows/);
});

test('a sheet table is checked exactly as before, whatever else is in the request', () => {
  assert.match(bad([{ name: 'A', rows: [{ label: 'Adult', package: -5 }] }]), /Package of "Adult" in A must be an amount/);
  assert.match(bad([{ name: 'A', layout: 'sheet', rows: [{ label: 'Adult', pax: 1.5 }] }]), /PAX of "Adult" in A/);
});

test('the total and the "has data" test follow the layout of the table', () => {
  const sheet = { name: 'S', layout: 'sheet', rows: [{ label: 'Adult', package: 1000, airfare: 0, visa: 0, tcs: 0, pax: 2 }] };
  const rooms = table('R', [row('For 2 Adults', 5000, { nights: 3 })]);
  assert.equal(tableTotal(sheet), 2000);
  assert.equal(tableTotal(rooms, { nights: 9 }), 15000);
  assert.equal(tableTotal(rooms, { nights: 0 }), 15000, 'typed nights beat the trip');
  assert.equal(tableHasData(sheet), true);
  assert.equal(tableHasData(rooms), true);
  assert.equal(tableHasData(table('R', [row('x', 0)])), false);
});

// ---------------------------------------- a confirmed package booking ----------------------------------------

const packageQuotation = (over = {}) => ({ quotationType: 'Package', paxDetails: '2 Adults', duration: '4 Nights / 5 Days', pricing: { grandTotal: 1 }, priceTables: [table('3 Star', [row('For 2 Adults', 5000, { rooms: 1 })]), table('4 Star', [row('For 2 Adults', 8000)])], ...over });

test('confirming a package priced with the tables asks which option, and the amount is that option\'s Grand Total', () => {
  const needs = confirmationFromQuotation(packageQuotation(), undefined, undefined);
  assert.equal(needs.ok, false);
  assert.match(needs.message, /2 pricing options/);
  const r = confirmationFromQuotation(packageQuotation(), undefined, 1);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.totalAmount, 32000, '8,000 x 4 nights (the trip) x 1 room');
  assert.equal(r.quote.priceTables.length, 1);
  assert.equal(r.quote.priceTables[0].name, '4 Star');
  assert.equal(r.quote.pricing.grandTotal, 32000);
  assert.match(r.optionName, /4 Star/);
});

test('an option with nothing entered is not offered, and one filled option needs no question', () => {
  const q = packageQuotation({ priceTables: [table('3 Star', [row('For 2 Adults', 5000)]), table('4 Star', [row('For 2 Adults', 0)])] });
  const r = confirmationFromQuotation(q, undefined, undefined);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.totalAmount, 20000);
});

test('a hotel quotation (sheet) is confirmed exactly as before', () => {
  const q = { quotationType: 'Only Hotel', paxDetails: '2 Adults', pricing: { grandTotal: 1 }, priceTables: [{ name: 'Option 1', layout: 'sheet', rows: [{ label: 'Adult', package: 10000, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }] };
  assert.equal(confirmationFromQuotation(q, undefined, undefined).totalAmount, 20000);
});

// ---------------------------------------- the browser's copy gives the same figures ----------------------------------------

test('the file the browser uses is the same file as the server\'s, so they cannot drift apart', () => {
  const server = readFileSync(new URL('../src/utils/roomTables.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const browser = readFileSync(new URL('../../frontend/src/utils/roomTables.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(browser, server, 'frontend/src/utils/roomTables.js must be an exact copy of backend/src/utils/roomTables.js: change both together');
  assert.deepEqual(browserSide.ROOM_ROW_LABELS, ROOM_ROW_LABELS);
  assert.deepEqual(browserSide.ROOM_TABLE_LIMITS, ROOM_TABLE_LIMITS);
});

test('property: totals are never negative, never fractional beyond paise, and adding a row never lowers a table\'s total', () => {
  const rowArb = fc.record({ label: fc.constant('x'), rate: fc.integer({ min: 0, max: 100000 }), nights: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 30 })), rooms: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 20 })) });
  fc.assert(
    fc.property(fc.array(rowArb, { maxLength: 4 }), rowArb, fc.constantFrom('', '1 Night', '6 Nights / 7 Days'), (rows, extra, duration) => {
      const d = roomDefaults({ duration });
      const before = roomTableTotal({ rows }, d);
      const after = roomTableTotal({ rows: [...rows, extra] }, d);
      assert.ok(before >= 0 && after >= before);
      assert.equal(Math.round(after * 100) / 100, after);
      assert.equal(browserSide.roomTableTotal({ rows: [...rows, extra] }, d), after, 'the browser file gives the same figure');
    }),
    { numRuns: 300 }
  );
});

test('property: hostile rows never throw; what is accepted has finite totals', () => {
  fc.assert(
    fc.property(fc.array(fc.anything({ maxDepth: 2 }), { maxLength: 6 }), (rows) => {
      const r = normalizeQuotationPriceTables([{ name: 'A', layout: 'rooms', rows }]);
      if (r.ok) assert.ok(Number.isFinite(tableTotal(r.value[0], { nights: 5 })));
      else assert.ok(typeof r.message === 'string' && r.message.length > 8);
    }),
    { numRuns: 400 }
  );
});
