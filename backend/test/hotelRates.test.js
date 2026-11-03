import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { RATE_LABELS, RATE_LIMITS, hotelTotal, numberIn, optionTotal, optionUsesRates, rowNights, rowTotal, rowUnits } from '../src/utils/hotelRates.js';
import * as browserSide from '../../frontend/src/utils/hotelRates.js';
import { normalizeQuotationHotels } from '../src/utils/quotationHotels.js';
import { OPTION_LIMITS, normalizeQuotationOptions } from '../src/utils/quotationOptions.js';
import { confirmationFromQuotation } from '../src/utils/confirmationSnapshot.js';

// The rate table of a hotel (the client's sheet: per room per night, nights, rooms, total) and the Grand Total of an option.

const stay = (over = {}) => ({ hotelName: 'Hotel Sunrise', nights: '3 Nights', noOfRooms: '2 Rooms', rates: [{ kind: 'room', label: '2 Adults', rate: 5000, nights: null, rooms: null }], ...over });

test('a row is the rate per room per night times the nights times the rooms; nights and rooms follow the stay', () => {
  const s = stay();
  assert.equal(rowNights(s, s.rates[0]), 3);
  assert.equal(rowUnits(s, s.rates[0]), 2);
  assert.equal(rowTotal(s, s.rates[0]), 30000);
});

test('an extra bed or a child counts one by default, and a number typed on the row replaces the stay\'s', () => {
  const s = stay({ rates: [{ kind: 'room', rate: 5000 }, { kind: 'extraBed', rate: 1500 }, { kind: 'childWithBed', rate: 1200, nights: 2, rooms: 2 }, { kind: 'childNoBed', rate: 800, rooms: 0 }] });
  assert.deepEqual(s.rates.map((r) => rowTotal(s, r)), [30000, 4500, 4800, 0]);
  assert.equal(hotelTotal(s), 39300);
});

test('a stay that does not say its rooms is one room; one that does not say its nights has no total yet', () => {
  assert.equal(rowUnits({ noOfRooms: '' }, { kind: 'room' }), 1);
  assert.equal(rowUnits({ noOfRooms: 'Twin' }, { kind: 'room' }), 1);
  assert.equal(rowTotal({ nights: '', noOfRooms: '1 Room' }, { kind: 'room', rate: 5000 }), 0);
});

test('the Grand Total of an option is every hotel added up, and only an option with a table is priced by tables', () => {
  const option = { hotels: [stay(), stay({ nights: '2 Nights', noOfRooms: '1 Room', rates: [{ kind: 'room', rate: 4000 }, { kind: 'extraBed', rate: 1000 }] })] };
  assert.equal(optionTotal(option), 30000 + 8000 + 2000);
  assert.equal(optionUsesRates(option), true);
  assert.equal(optionUsesRates({ hotels: [{ hotelName: 'Old', nights: '2 Nights' }] }), false);
  assert.equal(optionUsesRates({ hotels: [] }), false);
  assert.equal(optionTotal({ hotels: [] }), 0);
  assert.equal(optionTotal(undefined), 0);
});

test('amounts are rounded to paise, so a total never shows a long fraction', () => {
  assert.equal(rowTotal({ nights: '3 Nights' }, { kind: 'room', rate: 1999.99 }), 5999.97);
  assert.equal(rowTotal({ nights: '3 Nights' }, { kind: 'room', rate: 0.1 }), 0.3);
});

test('numberIn reads the first whole number of a text, or gives 0', () => {
  assert.equal(numberIn('3 Nights'), 3);
  assert.equal(numberIn('2 Rooms + 1 Extra'), 2);
  assert.equal(numberIn('Twin'), 0);
  assert.equal(numberIn(undefined), 0);
});

// ---------------------------------------- the server's check of what the browser sends ----------------------------------------

const okHotels = (value) => {
  const r = normalizeQuotationHotels(value);
  assert.equal(r.ok, true, r.message);
  return r.value;
};
const badHotels = (value) => {
  const r = normalizeQuotationHotels(value);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('rate rows are kept as sent: label, rate, and nights/rooms left empty when they follow the stay', () => {
  const [out] = okHotels([stay({ rates: [{ kind: 'room', label: '  2   Adults ', rate: '5000.456', nights: '', rooms: undefined }, { kind: 'extraBed', rate: 1500, nights: 2, rooms: 1 }] })]);
  assert.deepEqual(out.rates, [
    { kind: 'room', label: '2 Adults', rate: 5000.46, nights: null, rooms: null },
    { kind: 'extraBed', label: 'Extra bed', rate: 1500, nights: 2, rooms: 1 }
  ]);
});

test('a stay with no rates (every older one, and the mobile app) gets an empty table', () => {
  assert.deepEqual(okHotels([{ hotelName: 'Old', nights: '2 Nights' }])[0].rates, []);
  assert.deepEqual(okHotels([{ hotelName: 'Old', rates: null }])[0].rates, []);
});

test('problems with the table are explained in plain words and name the hotel and the row', () => {
  assert.match(badHotels([stay({ rates: 'x' })]), /rates of hotel stay 1 must be a list/);
  assert.match(badHotels([stay({ rates: [{ kind: 'room' }, { kind: 'room' }] })]), /"2 Adults" row twice/);
  assert.match(badHotels([stay({ rates: [{ kind: 'suite', rate: 1 }] })]), /rate row 1 of hotel stay 1 must be the room, an extra bed/);
  assert.match(badHotels([stay({ rates: [{ kind: 'room', rate: -5 }] })]), /rate of the rate row 1 of hotel stay 1 must be an amount from 0 to 1,00,00,000/);
  assert.match(badHotels([stay({ rates: [{ kind: 'room', rate: 'lots' }] })]), /must be an amount/);
  assert.match(badHotels([stay({ rates: [{ kind: 'room', rate: 1, nights: 1.5 }] })]), /nights of the rate row 1 .* whole number from 0 to 365/);
  assert.match(badHotels([stay({ rates: [{ kind: 'room', rate: 1, nights: 366 }] })]), /whole number from 0 to 365/);
  assert.match(badHotels([stay({ rates: [{ kind: 'room', rate: 1, rooms: -1 }] })]), /number of rooms .* whole number from 0 to 999/);
  assert.match(badHotels([stay({ rates: [{ kind: 'room', label: 'x'.repeat(61), rate: 1 }] })]), /too long/);
  assert.match(badHotels([stay({ rates: [1] })]), /rate row 1 of hotel stay 1 is not valid/);
  assert.match(badHotels([stay({ rates: Array.from({ length: 5 }, () => ({ kind: 'room' })) })]), /at most 4 rate rows/);
  assert.match(badHotels([{}, stay({ rates: [{ kind: 'extraBed', rate: Number.POSITIVE_INFINITY }] })]), /hotel stay 2/);
});

const option = (hotels, over = {}) => ({ name: 'Option 1', hotels, pricePerPerson: 0, totalPrice: 0, priceNote: '', ...over });
const okOptions = (value) => {
  const r = normalizeQuotationOptions(value);
  assert.equal(r.ok, true, r.message);
  return r.value;
};

test('the total of an option priced by tables is worked out by the server, whatever the browser says', () => {
  const [out] = okOptions([option([stay()], { totalPrice: 1 })]);
  assert.equal(out.totalPrice, 30000);
  const [liar] = okOptions([option([stay()], { totalPrice: 999999999 })]);
  assert.equal(liar.totalPrice, 30000);
});

test('an option without tables keeps the total it was sent, exactly as before', () => {
  const [out] = okOptions([option([{ hotelName: 'Old', nights: '2 Nights' }], { pricePerPerson: 25000, totalPrice: 50000 })]);
  assert.equal(out.totalPrice, 50000);
  assert.equal(out.pricePerPerson, 25000);
});

test('an option whose tables add up to more than the limit is refused in plain words', () => {
  const huge = stay({ nights: '300 Nights', noOfRooms: '900 Rooms', rates: [{ kind: 'room', rate: 9_000_000 }] });
  const r = normalizeQuotationOptions([option([huge])]);
  assert.equal(r.ok, false);
  assert.match(r.message, /total of option 1 is too large/);
});

test('each option has its own total, and a table in one option does not change another', () => {
  const out = okOptions([option([stay()]), option([stay({ rates: [{ kind: 'room', rate: 100 }] })], { name: 'Option 2' }), option([{ hotelName: 'Old' }], { name: 'Option 3', totalPrice: 7 })]);
  assert.deepEqual(out.map((o) => o.totalPrice), [30000, 600, 7]);
});

// ---------------------------------------- a confirmed booking ----------------------------------------

test('confirming an option priced by tables keeps its hotels with their tables and says the Grand Total, not a price per person', () => {
  const quotation = { quotationType: 'Only Hotel', paxDetails: '2 Adults', pricing: { grandTotal: 0 }, packageDetails: { hotels: [] }, options: [option([stay()], { totalPrice: 30000, pricePerPerson: 15000 }), option([stay({ rates: [{ kind: 'room', rate: 100 }] })], { name: 'Option 2' })] };
  const r = confirmationFromQuotation(quotation, 0);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.totalAmount, 30000);
  assert.equal(r.quote.pricing.grandTotal, 30000);
  assert.equal(r.quote.pricing.totalCostPerPerson, 0);
  assert.match(r.quote.pricing.totalCostNote, /Grand Total as per the rates/);
  assert.deepEqual(r.quote.packageDetails.hotels[0].rates, quotation.options[0].hotels[0].rates);
  assert.deepEqual(r.quote.options, []);
  assert.equal(r.optionName, 'Option 1');
});

test('the Grand Total of a confirmation is counted from the tables even if the stored total is stale', () => {
  const quotation = { quotationType: 'Only Hotel', paxDetails: '2 Adults', options: [option([stay()], { totalPrice: 1 }), option([stay()], { name: 'Option 2' })] };
  assert.equal(confirmationFromQuotation(quotation, 0).totalAmount, 30000);
});

test('confirming an option with only a price per person is exactly as before', () => {
  const quotation = { quotationType: 'Only Hotel', paxDetails: '2 Adults', options: [option([{ hotelName: 'Old' }], { pricePerPerson: 25000, totalPrice: 50000, priceNote: 'Per person' }), option([{ hotelName: 'Old' }], { name: 'Option 2' })] };
  const r = confirmationFromQuotation(quotation, 0);
  assert.equal(r.totalAmount, 50000);
  assert.equal(r.quote.pricing.totalCostPerPerson, 25000);
  assert.match(r.quote.pricing.totalCostNote, /Rs 25,000 Per person/);
});

// ---------------------------------------- the browser's copy gives the same figures ----------------------------------------

test('the file the browser uses gives exactly the same figures as the server\'s', () => {
  const kinds = fc.constantFrom('room', 'extraBed', 'childWithBed', 'childNoBed');
  const maybe = (arb) => fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(''), arb);
  const row = fc.record({ kind: kinds, label: fc.string({ maxLength: 10 }), rate: fc.oneof(fc.integer({ min: 0, max: 50000 }), fc.double({ min: 0, max: 50000, noNaN: true })), nights: maybe(fc.integer({ min: 0, max: 30 })), rooms: maybe(fc.integer({ min: 0, max: 20 })) });
  const oneStay = fc.record({ nights: fc.constantFrom('', '1 Night', '3 Nights', '12 Nights', 'Many'), noOfRooms: fc.constantFrom('', '1 Room', '2 Rooms', '10 Rooms', 'Twin'), rates: fc.array(row, { maxLength: 4 }) });
  fc.assert(
    fc.property(fc.array(oneStay, { maxLength: 4 }), (hotels) => {
      const option2 = { hotels };
      assert.equal(browserSide.optionTotal(option2), optionTotal(option2));
      assert.equal(browserSide.optionUsesRates(option2), optionUsesRates(option2));
      for (const s of hotels) {
        assert.equal(browserSide.hotelTotal(s), hotelTotal(s));
        for (const r of s.rates) {
          assert.equal(browserSide.rowTotal(s, r), rowTotal(s, r));
          assert.equal(browserSide.rowNights(s, r), rowNights(s, r));
          assert.equal(browserSide.rowUnits(s, r), rowUnits(s, r));
        }
      }
    }),
    { numRuns: 400 }
  );
  assert.deepEqual(browserSide.RATE_LABELS, RATE_LABELS);
  assert.deepEqual(browserSide.RATE_LIMITS, RATE_LIMITS);
});

test('property: totals are never negative or fractional beyond paise, and adding a row never lowers a hotel\'s total', () => {
  const row = fc.record({ kind: fc.constantFrom('room', 'extraBed', 'childWithBed', 'childNoBed'), rate: fc.integer({ min: 0, max: 100000 }), nights: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 30 })), rooms: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 20 })) });
  fc.assert(
    fc.property(fc.record({ nights: fc.constantFrom('1 Night', '4 Nights'), noOfRooms: fc.constantFrom('1 Room', '3 Rooms') }), fc.array(row, { maxLength: 3 }), row, (base, rows, extra) => {
      const before = hotelTotal({ ...base, rates: rows });
      const after = hotelTotal({ ...base, rates: [...rows, extra] });
      assert.ok(before >= 0 && after >= before);
      assert.equal(Math.round(after * 100), after * 100 > 0 ? Math.round(after * 100) : 0);
    }),
    { numRuns: 300 }
  );
});

test('hostile rate rows never throw, and never produce a total that is not a number', () => {
  const junk = fc.anything({ maxDepth: 2 });
  fc.assert(
    fc.property(fc.array(junk, { maxLength: 6 }), (rates) => {
      const r = normalizeQuotationHotels([{ hotelName: 'X', nights: '2 Nights', rates }]);
      if (r.ok) {
        const total = hotelTotal(r.value[0]);
        assert.ok(Number.isFinite(total) && total >= 0);
        assert.ok(r.value[0].rates.length <= RATE_LIMITS.rows);
      } else assert.ok(typeof r.message === 'string' && r.message.length > 8);
    }),
    { numRuns: 400 }
  );
  assert.ok(OPTION_LIMITS.hotelsPerOption >= 1);
});

test('the browser file and the server file are the same file, so they cannot drift apart', async () => {
  const { readFileSync } = await import('node:fs');
  const server = readFileSync(new URL('../src/utils/hotelRates.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const browser = readFileSync(new URL('../../frontend/src/utils/hotelRates.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(browser, server, 'frontend/src/utils/hotelRates.js must be an exact copy of backend/src/utils/hotelRates.js: change both together');
});
