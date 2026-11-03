import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The pricing tables of a hotel quotation: stored, validated in plain words, kept by duplicating, and used when the booking is confirmed.

let app;
let admin;
const quotations = (path = '', opts = {}) => app.call(`/api/quotations${path}`, opts);
const row = (label, over = {}) => ({ label, package: 30000, airfare: 12000, visa: 6000, tcs: 1500, pax: 2, ...over });
const sheet = () => [
  { name: 'Option 1', rows: [row('Adult'), row('Extra bed', { pax: 1 }), row('CWB', { tcs: 0, pax: 1 }), row('CNB', { pax: 0 })] },
  { name: 'Option 2', rows: [row('Adult', { package: 36000 }), row('Extra bed', { pax: 0 }), row('CWB', { pax: 0 }), row('CNB', { pax: 0 })] }
];
const create = async (over = {}) => (await quotations('', { method: 'POST', token: admin.token, json: { clientName: 'Aarav', destination: 'GOA HOTEL', quotationType: 'Only Hotel', status: 'Sent', priceTables: sheet(), ...over } })).body;
const confirm = async (quotation, extra = {}) => (await app.call('/api/confirmations', { method: 'POST', token: admin.token, json: { quotationId: quotation._id, ...extra } })).body;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
});
after(async () => {
  await app.close();
});

test('a hotel quotation keeps its pricing options exactly as entered', async () => {
  const body = await create();
  assert.equal(body.success, true, body.message);
  const tables = body.data.priceTables;
  assert.deepEqual(tables.map((t) => [t.name, t.rows.map((r) => r.label)]), [['Option 1', ['Adult', 'Extra bed', 'CWB', 'CNB']], ['Option 2', ['Adult', 'Extra bed', 'CWB', 'CNB']]]);
  assert.deepEqual(tables[0].rows[0], { label: 'Adult', package: 30000, airfare: 12000, visa: 6000, tcs: 1500, pax: 2 });
  const read = (await quotations(`/${body.data._id}`, { token: admin.token })).body.data;
  assert.deepEqual(read.priceTables, tables);
});

test('typed values are tidied: blanks are 0, amounts rounded to the paisa, an empty name becomes "Option n"', async () => {
  const body = await create({ priceTables: [{ name: ' ', rows: [{ label: ' Adult ', package: '1000.456', airfare: '', pax: '3' }] }] });
  assert.equal(body.success, true, body.message);
  assert.deepEqual(body.data.priceTables, [{ name: 'Option 1', layout: 'sheet', rows: [{ label: 'Adult', package: 1000.46, airfare: 0, visa: 0, tcs: 0, pax: 3 }] }]);
});

test('problems are explained in plain words naming the option and the row, and nothing is saved', async () => {
  const before = (await quotations('', { token: admin.token })).body.count;
  const cases = [
    [[{ name: 'Option 1', rows: [row('Adult', { package: -5 })] }], /The Package of "Adult" in Option 1 must be an amount/],
    [[{ name: 'Taj', rows: [row('Adult'), row('CWB', { pax: 1.5 })] }], /The PAX of "CWB" in Taj must be a whole number from 0 to 999/],
    [[{ name: 'Option 1', rows: [row('')] }], /Please enter a name for row 1 of Option 1/],
    [[{ name: 'A', rows: 'x' }], /A needs a list of rows/],
    ['not a list', /pricing tables must be a list/],
    [Array.from({ length: 7 }, (_, i) => ({ name: `O${i}`, rows: [] })), /at most 6 pricing options/]
  ];
  for (const [priceTables, message] of cases) {
    const body = await create({ priceTables });
    assert.equal(body.success, false, String(message));
    assert.match(body.message, message);
  }
  assert.equal((await quotations('', { token: admin.token })).body.count, before);
});

test('an update that does not mention them leaves them alone; sending them replaces them; a refused update changes nothing', async () => {
  const made = (await create()).data;
  const statusOnly = (await quotations(`/${made._id}`, { method: 'PUT', token: admin.token, json: { status: 'Follow up' } })).body;
  assert.equal(statusOnly.data.priceTables.length, 2);
  const refused = (await quotations(`/${made._id}`, { method: 'PUT', token: admin.token, json: { priceTables: [{ name: 'X', rows: [row('Adult', { visa: 'lots' })] }] } })).body;
  assert.equal(refused.success, false);
  assert.equal((await quotations(`/${made._id}`, { token: admin.token })).body.data.priceTables.length, 2);
  const replaced = (await quotations(`/${made._id}`, { method: 'PUT', token: admin.token, json: { priceTables: [sheet()[1]] } })).body;
  assert.deepEqual(replaced.data.priceTables.map((t) => t.name), ['Option 2']);
  const emptied = (await quotations(`/${made._id}`, { method: 'PUT', token: admin.token, json: { priceTables: [] } })).body;
  assert.deepEqual(emptied.data.priceTables, [], 'an emptied list is a real change');
});

test('duplicating a hotel quotation keeps its pricing options', async () => {
  const made = (await create()).data;
  const copy = (await quotations(`/${made._id}/duplicate`, { method: 'POST', token: admin.token })).body;
  assert.equal(copy.success, true, copy.message);
  assert.deepEqual(copy.data.priceTables, made.priceTables);
});

test('confirming asks which pricing option the client accepted, keeps only that one, and uses its Grand Total', async () => {
  const q = (await create()).data;
  const noChoice = await confirm(q);
  assert.equal(noChoice.success, false);
  assert.equal(noChoice.message, 'This quotation has 2 pricing options. Please choose the one the client accepted.');
  assert.equal((await quotations(`/${q._id}`, { token: admin.token })).body.data.confirmationId, '', 'nothing was locked');
  assert.match((await confirm(q, { priceTableIndex: 9 })).message, /Please choose one of the 2 pricing options/);

  const ok = await confirm(q, { priceTableIndex: 1 });
  assert.equal(ok.success, true, ok.message);
  assert.deepEqual(ok.data.quote.priceTables.map((t) => t.name), ['Option 2']);
  assert.equal(ok.data.payment.totalAmount, (36000 + 12000 + 6000 + 1500) * 2);
  assert.equal(ok.data.optionName, 'Option 2');
  assert.equal((await quotations(`/${q._id}`, { token: admin.token })).body.data.priceTables.length, 2, 'the quotation still shows everything it offered');
});

test('a single filled-in option is confirmed without a choice; an option left empty is not offered', async () => {
  const q = (await create({ priceTables: [sheet()[0], { name: 'Option 2', rows: [row('Adult', { package: 0, airfare: 0, visa: 0, tcs: 0, pax: 0 })] }] })).data;
  const ok = await confirm(q);
  assert.equal(ok.success, true, ok.message);
  assert.equal(ok.data.payment.totalAmount, 99000 + 49500 + 48000);
});

test('the pricing options of another kind of quotation are ignored when confirming', async () => {
  const q = (await create({ quotationType: 'Package', pricing: { grandTotal: 55555 } })).data;
  const ok = await confirm(q);
  assert.equal(ok.success, true, ok.message);
  assert.equal(ok.data.payment.totalAmount, 55555);
});

// ---------------------------------------- the rooms layout of a package (the client's second sheet) ----------------------------------------

const roomRow = (label, rate, over = {}) => ({ label, rate, nights: null, rooms: null, ...over });
const rooms = () => [
  { name: '3 Star', layout: 'rooms', rows: [roomRow('For 2 Adults', 5000, { rooms: 2 }), roomRow('Extra bed', 1500)] },
  { name: '4 Star', layout: 'rooms', rows: [roomRow('For 2 Adults', 8000), roomRow('Child With bed', 1200, { nights: 2 })] }
];
const createPackage = async (over = {}) => (await quotations('', { method: 'POST', token: admin.token, json: { clientName: 'Meera', destination: 'BALI', quotationType: 'Package', status: 'Sent', paxDetails: '2 Adults', duration: '4 Nights / 5 Days', pricing: { grandTotal: 1 }, priceTables: rooms(), ...over } })).body;

test('a package keeps its rooms tables exactly as entered, with nights and rooms empty while they follow the trip', async () => {
  const body = await createPackage();
  assert.equal(body.success, true, body.message);
  const [first, second] = body.data.priceTables;
  assert.equal(first.layout, 'rooms');
  assert.deepEqual(first.rows[0], { label: 'For 2 Adults', rate: 5000, nights: null, rooms: 2 });
  assert.deepEqual(first.rows[1], { label: 'Extra bed', rate: 1500, nights: null, rooms: null });
  assert.deepEqual(second.rows[1], { label: 'Child With bed', rate: 1200, nights: 2, rooms: null });
  assert.equal(Object.keys(first.rows[0]).includes('package'), false, 'a rooms row keeps none of the sheet\'s figures');
  const read = (await quotations(`/${body.data._id}`, { token: admin.token })).body.data;
  assert.deepEqual(read.priceTables, body.data.priceTables);
});

test('the server keeps the quotation\'s total equal to its lowest Grand Total, for lists and statistics', async () => {
  const body = await createPackage();
  // 3 Star: 5,000 x 4 nights x 2 rooms + 1,500 x 4 nights = 46,000   4 Star: 8,000 x 4 + 1,200 x 2 = 34,400
  assert.equal(body.data.pricing.grandTotal, 34400);
  assert.equal(body.data.pricing.totalCostPerPerson, 0);
  assert.match(body.data.pricing.totalCostNote, /^From Rs 34,400$/);
  const updated = (await quotations(`/${body.data._id}`, { method: 'PUT', token: admin.token, json: { quotationType: 'Package', duration: '2 Nights / 3 Days', priceTables: [rooms()[0]], pricing: { grandTotal: 1 } } })).body;
  assert.equal(updated.success, true, updated.message);
  assert.equal(updated.data.pricing.grandTotal, 23000, '5,000 x 2 nights x 2 rooms + 1,500 x 2 nights');
  assert.equal(updated.data.pricing.totalCostNote, 'Rs 23,000', 'one option: not "From"');
});

test('a hotel quotation priced with the sheet gets the same: its total is its lowest Grand Total', async () => {
  const body = await create();
  assert.equal(body.success, true, body.message);
  // Option 1: 99,000 + 49,500 + 48,000 = 196,500   Option 2: 111,000
  assert.equal(body.data.pricing.grandTotal, 111000);
});

test('a total that cannot be worked out yet leaves the total alone (the trip has no length and a row follows it)', async () => {
  const body = await createPackage({ duration: '', pricing: { grandTotal: 777 } });
  assert.equal(body.success, true, body.message);
  assert.equal(body.data.pricing.grandTotal, 777);
});

test('problems with a rooms table are explained in plain words and nothing is saved', async () => {
  const before = (await quotations('', { token: admin.token })).body.total;
  const r = await quotations('', { method: 'POST', token: admin.token, json: { clientName: 'X', destination: 'Y', quotationType: 'Package', priceTables: [{ name: 'A', layout: 'rooms', rows: [roomRow('For 2 Adults', 5000, { nights: 1.5 })] }] } });
  assert.equal(r.body.success, false);
  assert.match(r.body.message, /number of nights of "For 2 Adults" in A must be a whole number from 0 to 365/);
  assert.equal((await quotations('', { token: admin.token })).body.total, before);
});

test('confirming a package asks which option, and the booking is for that option\'s Grand Total with only that table kept', async () => {
  const q = (await createPackage()).data;
  const needs = await confirm(q);
  assert.equal(needs.success, false);
  assert.match(needs.message, /2 pricing options/);
  const ok = await confirm(q, { priceTableIndex: 0 });
  assert.equal(ok.success, true, ok.message);
  assert.equal(ok.data.payment.totalAmount, 46000);
  assert.deepEqual(ok.data.quote.priceTables.map((t) => t.name), ['3 Star']);
  assert.equal(ok.data.quote.priceTables[0].layout, 'rooms');
  assert.match(ok.data.optionName, /3 Star/);
});

test('a package with sheet tables (not from the app) is priced the usual way, not by those tables', async () => {
  const q = (await createPackage({ priceTables: sheet(), pricing: { grandTotal: 55555 } })).data;
  assert.equal(q.pricing.grandTotal, 55555);
  const ok = await confirm(q);
  assert.equal(ok.success, true, ok.message);
  assert.equal(ok.data.payment.totalAmount, 55555);
});
