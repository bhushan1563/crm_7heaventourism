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
  assert.deepEqual(body.data.priceTables, [{ name: 'Option 1', rows: [{ label: 'Adult', package: 1000.46, airfare: 0, visa: 0, tcs: 0, pax: 3 }] }]);
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
