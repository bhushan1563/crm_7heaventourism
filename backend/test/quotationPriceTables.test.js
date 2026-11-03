import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { PRICE_TABLE_LIMITS as L, normalizeQuotationPriceTables, rowFinal, rowTotal, tableHasData, tableTotal } from '../src/utils/quotationPriceTables.js';
import { confirmationFromQuotation } from '../src/utils/confirmationSnapshot.js';

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
const row = (label, over = {}) => ({ label, package: 30000, airfare: 12000, visa: 6000, tcs: 1500, pax: 2, ...over });
const sheet = () => [
  { name: 'Option 1', rows: [row('Adult'), row('Extra bed', { package: 25000, airfare: 12000, visa: 6000, tcs: 1500, pax: 1 }), row('CWB', { package: 22000, airfare: 9000, visa: 6000, tcs: 0, pax: 1 }), row('CNB', { package: 15000, airfare: 9000, visa: 6000, tcs: 0, pax: 0 })] },
  { name: 'Option 2', rows: [row('Adult', { package: 36000 }), row('Extra bed', { pax: 0 }), row('CWB', { pax: 0 }), row('CNB', { pax: 0 })] }
];

test('a row\'s Total is Package + Airfare + Visa + TCS, its Final Price is Total x PAX, and an option\'s Grand Total adds the Final Prices', () => {
  const [one, two] = sheet();
  assert.equal(rowTotal(one.rows[0]), 49500);
  assert.equal(rowFinal(one.rows[0]), 99000); // 49,500 x 2 adults
  assert.equal(rowFinal(one.rows[1]), 44500); // 25,000 + 12,000 + 6,000 + 1,500 for one extra bed
  assert.equal(rowFinal(one.rows[2]), 37000);
  assert.equal(rowFinal(one.rows[3]), 0, 'no persons, no price');
  assert.equal(tableTotal(one), 99000 + 44500 + 37000);
  assert.equal(tableTotal(two), (36000 + 12000 + 6000 + 1500) * 2);
});

test('the arithmetic is exact to the paisa and copes with blanks', () => {
  assert.equal(rowTotal({ package: 0.1, airfare: 0.2 }), 0.3);
  assert.equal(rowFinal({ package: 0.1, airfare: 0.2, pax: 3 }), 0.9);
  assert.equal(rowTotal({}), 0);
  assert.equal(rowFinal({ package: 100 }), 0, 'PAX left blank is none');
  assert.equal(tableTotal({}), 0);
  assert.equal(tableTotal(undefined), 0);
  assert.equal(tableTotal({ rows: [] }), 0);
});

test('an option with nothing entered is empty, one with any amount or any PAX is not', () => {
  assert.equal(tableHasData({ rows: [{ label: 'Adult' }, { label: 'CWB' }] }), false);
  assert.equal(tableHasData({ rows: [{ label: 'Adult', pax: 2 }] }), true);
  assert.equal(tableHasData({ rows: [{ label: 'Adult', tcs: 100 }] }), true);
  assert.equal(tableHasData(undefined), false);
});

test('what is typed is tidied: blanks become 0, amounts are rounded to the paisa, labels and names are cleaned, an empty name becomes "Option n"', () => {
  const tables = ok([{ name: '  ', rows: [{ label: '  Extra   bed ', package: '25000.456', airfare: '', visa: null, tcs: undefined, pax: '2' }] }, { name: ' Taj  option ', rows: [] }]);
  assert.deepEqual(tables[0], { name: 'Option 1', layout: 'sheet', rows: [{ label: 'Extra bed', package: 25000.46, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }); // a table without a layout is a sheet
  assert.equal(tables[1].name, 'Taj option');
  assert.deepEqual(ok([]), []);
});

test('every problem is explained in plain words and names the option and the row', () => {
  assert.equal(bad('free'), 'The pricing tables must be a list.');
  assert.match(bad(Array.from({ length: L.tables + 1 }, () => ({ name: 'x', rows: [] }))), /at most 6 pricing options \(there are 7\)/);
  assert.equal(bad(['Option 1']), 'Pricing option 1 is not valid.');
  assert.match(bad([{ name: 'x'.repeat(L.name + 1), rows: [] }]), /name of pricing option 1 is too long/i);
  assert.equal(bad([{ name: 'A', rows: 'Adult' }]), 'A needs a list of rows.');
  assert.match(bad([{ name: 'A', rows: Array.from({ length: L.rows + 1 }, () => row('x')) }]), /A can have at most 10 rows \(there are 11\)/);
  assert.equal(bad([{ name: 'A', rows: ['Adult'] }]), 'Row 1 of A is not valid.');
  assert.equal(bad([{ name: 'A', rows: [row('')] }]), 'Please enter a name for row 1 of A.');
  assert.match(bad([{ name: 'A', rows: [row('Adult', { package: -1 })] }]), /^The Package of "Adult" in A must be an amount from 0 to Rs 1,00,00,00,000\./);
  assert.match(bad([{ name: 'Option 2', rows: [row('Adult'), row('CWB', { tcs: 'lots' })] }]), /The TCS of "CWB" in Option 2/);
  assert.match(bad([{ name: 'A', rows: [row('Adult', { airfare: { $gt: 0 } })] }]), /The Airfare of "Adult"/);
  assert.match(bad([{ name: 'A', rows: [row('Adult', { visa: 5e12 })] }]), /The Visa of "Adult"/);
  assert.equal(bad([{ name: 'A', rows: [row('Adult', { pax: 2.5 })] }]), 'The PAX of "Adult" in A must be a whole number from 0 to 999.');
  assert.match(bad([{ name: 'A', rows: [row('Adult', { pax: -1 })] }]), /PAX of "Adult"/);
  assert.match(bad([{ name: 'A', rows: [row('Adult', { pax: 1000 })] }]), /PAX of "Adult"/);
});

test('property: whatever arrives, the answer is a clear message or tables that obey every limit; cleaning twice changes nothing; the totals add up', () => {
  const num = fc.oneof(fc.double({ min: -50, max: 2e6, noNaN: true }), fc.integer({ min: -3, max: 1500 }), fc.constantFrom('', null, undefined, 'abc', '12.5', {}));
  const rowArb = fc.record({ label: fc.oneof(fc.string({ maxLength: 20 }), fc.constantFrom('Adult', '', '<b>x</b>')), package: num, airfare: num, visa: num, tcs: num, pax: num }, { requiredKeys: [] });
  const tableArb = fc.record({ name: fc.oneof(fc.string({ maxLength: 30 }), fc.constant(undefined)), rows: fc.oneof(fc.array(rowArb, { maxLength: 5 }), fc.constant('x')) }, { requiredKeys: [] });
  fc.assert(
    fc.property(fc.oneof(fc.array(tableArb, { maxLength: 3 }), fc.constant('x')), (value) => {
      const r = normalizeQuotationPriceTables(value);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      for (const table of r.value) {
        assert.ok(table.name.length > 0 && table.name.length <= L.name);
        for (const rw of table.rows) {
          assert.ok(rw.label.length > 0 && rw.label.length <= L.label);
          for (const k of ['package', 'airfare', 'visa', 'tcs']) assert.ok(Number.isFinite(rw[k]) && rw[k] >= 0 && rw[k] <= L.maxAmount);
          assert.ok(Number.isInteger(rw.pax) && rw.pax >= 0 && rw.pax <= L.maxPax);
          assert.ok(Math.abs(rowFinal(rw) - rowTotal(rw) * rw.pax) < 0.011);
        }
        assert.ok(Math.abs(tableTotal(table) - table.rows.reduce((s, rw) => s + rowFinal(rw), 0)) < 0.011 * (table.rows.length + 1));
        assert.ok(tableTotal(table) >= 0);
      }
      assert.deepEqual(normalizeQuotationPriceTables(r.value), { ok: true, value: r.value });
    }),
    { numRuns: 400 }
  );
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Confirming a hotel quotation that has pricing options

const hotelQuotation = (over = {}) => ({ quotationNo: '7H-QT-2026-001', quotationType: 'Only Hotel', paxDetails: '2 Adults', pricing: { grandTotal: 1, items: [{ name: 'old' }] }, priceTables: ok(sheet()), options: [], packageDetails: { hotels: [{ hotelName: 'H' }] }, ...over });

test('with several pricing options filled in, the accepted one is needed; it alone is kept, and its Grand Total is the amount', () => {
  const q = hotelQuotation();
  assert.equal(confirmationFromQuotation(q, undefined, undefined).message, 'This quotation has 2 pricing options. Please choose the one the client accepted.');
  assert.equal(confirmationFromQuotation(q, undefined, 5).message, 'Please choose one of the 2 pricing options.');
  const r = confirmationFromQuotation(q, undefined, 1);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.totalAmount, 111000);
  assert.deepEqual(r.quote.priceTables.map((t) => t.name), ['Option 2']);
  assert.equal(r.quote.pricing.grandTotal, 111000);
  assert.deepEqual(r.quote.pricing.items, []);
  assert.equal(r.optionName, 'Option 2');
  assert.equal(confirmationFromQuotation(q, undefined, '0').totalAmount, 180500, 'the digits of an index are accepted: option 1 comes to 99,000 + 44,500 + 37,000');
  assert.equal(q.priceTables.length, 2, 'the quotation itself is untouched');
});

test('an option that was left empty is not offered, and a single filled-in option needs no choice', () => {
  const emptied = ok([sheet()[0], { name: 'Option 2', rows: [row('Adult', { package: 0, airfare: 0, visa: 0, tcs: 0, pax: 0 })] }]);
  const r = confirmationFromQuotation(hotelQuotation({ priceTables: emptied }), undefined, undefined);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.totalAmount, 180500);
  assert.equal(confirmationFromQuotation(hotelQuotation({ priceTables: emptied }), undefined, 1).totalAmount, 180500, 'a choice that points at the empty option is ignored when there is only one real choice');
});

test('hotel options and pricing options are chosen separately, and the pricing option decides the amount', () => {
  const q = hotelQuotation({ options: [{ name: 'Hotel A', hotels: [{ hotelName: 'A' }], pricePerPerson: 10, totalPrice: 20 }, { name: 'Hotel B', hotels: [{ hotelName: 'B' }], pricePerPerson: 15, totalPrice: 30 }] });
  assert.match(confirmationFromQuotation(q, undefined, 0).message, /offers 2 hotel options/);
  const r = confirmationFromQuotation(q, 1, 1);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.optionName, 'Hotel B · Option 2');
  assert.equal(r.totalAmount, 111000);
  assert.deepEqual(r.quote.packageDetails.hotels.map((h) => h.hotelName), ['B']);
});

test('the pricing option that goes with the hotel option is taken when none is named: Option 2 of the pricing is for the second hotel option', () => {
  const q = hotelQuotation({ options: [{ name: '3 Star', hotels: [{ hotelName: 'A' }], pricePerPerson: 0, totalPrice: 0 }, { name: '4 Star', hotels: [{ hotelName: 'B' }], pricePerPerson: 0, totalPrice: 0 }] });
  const first = confirmationFromQuotation(q, 0, undefined);
  assert.equal(first.ok, true, first.message);
  assert.equal(first.totalAmount, 180500);
  assert.equal(first.optionName, '3 Star · Option 1');
  const second = confirmationFromQuotation(q, 1, undefined);
  assert.equal(second.totalAmount, 111000);
  assert.deepEqual(second.quote.priceTables.map((t) => t.name), ['Option 2']);
  assert.equal(confirmationFromQuotation(q, 1, 0).totalAmount, 180500, 'a pricing option named on purpose wins over the one in the same place');
  // the same name on both sides is said once
  const same = hotelQuotation({ options: [{ name: 'Option 1', hotels: [{ hotelName: 'A' }], pricePerPerson: 0, totalPrice: 0 }, { name: 'Option 2', hotels: [{ hotelName: 'B' }], pricePerPerson: 0, totalPrice: 0 }] });
  assert.equal(confirmationFromQuotation(same, 1, undefined).optionName, 'Option 2');
});

test('pricing tables on a land service or a visa quotation are ignored: they have their own pricing', () => {
  for (const quotationType of ['Land Service', 'Visa', 'Events / Corporate']) {
    const r = confirmationFromQuotation(hotelQuotation({ quotationType }), undefined, undefined);
    assert.equal(r.ok, true);
    assert.equal(r.totalAmount, 1, `${quotationType}: the price of the quotation, as before`);
  }
});
