import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// A hotel of the hotel list carries its usual prices as pricing tables (Option 1, Option 2 ..., each with its own name), in the
// layout of the company's pricing sheet.

let app;
let admin;
let sales;
let viewer;
const hotels = (path = '', opts = {}) => app.call(`/api/hotels${path}`, opts);
const as = (who, json, method = 'POST') => ({ method, token: who.token, json });
const row = (label, over = {}) => ({ label, package: 18000, airfare: 0, visa: 0, tcs: 0, pax: 2, ...over });
const tables = () => [
  { name: 'Deluxe room', rows: [row('Adult'), row('Extra bed', { package: 4000, pax: 1 }), row('CWB', { package: 3000, pax: 0 }), row('CNB', { package: 1500, pax: 0 })] },
  { name: 'Suite', rows: [row('Adult', { package: 30000 }), row('Extra bed', { package: 6000, pax: 0 }), row('CWB', { pax: 0 }), row('CNB', { pax: 0 })] }
];
let counter = 0;
const create = async (over = {}) => (await hotels('', as(sales, { name: `Hotel ${(counter += 1)}`, city: 'Udaipur', priceTables: tables(), ...over }))).body;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  sales = await app.makeUser('Sales');
  viewer = await app.makeUser('Viewer');
});
after(async () => {
  await app.close();
});

test('a hotel is saved with its pricing tables, names included, and they come back exactly', async () => {
  const body = await create();
  assert.equal(body.success, true, body.message);
  assert.deepEqual(body.data.priceTables.map((t) => t.name), ['Deluxe room', 'Suite']);
  assert.deepEqual(body.data.priceTables[0].rows.map((r) => [r.label, r.package, r.pax]), [['Adult', 18000, 2], ['Extra bed', 4000, 1], ['CWB', 3000, 0], ['CNB', 1500, 0]]);
  const read = (await hotels(`/${body.data._id}`, { token: viewer.token })).body.data;
  assert.deepEqual(read.priceTables, body.data.priceTables);
});

test('a hotel saved without tables simply has none, and the list never carries them', async () => {
  const bare = await create({ priceTables: undefined });
  assert.equal(bare.success, true, bare.message);
  assert.deepEqual(bare.data.priceTables, []);
  const listed = (await hotels('?limit=50', { token: admin.token })).body.data;
  assert.ok(listed.length >= 2);
  for (const h of listed) assert.equal('priceTables' in h, false, 'the list shows only what it needs');
});

test('problems are explained in plain words naming the option and the row, and nothing is saved', async () => {
  const before = (await hotels('?status=all', { token: admin.token })).body.total;
  const body = await create({ priceTables: [{ name: 'Suite', rows: [row('Adult', { tcs: 'lots' })] }] });
  assert.equal(body.success, false);
  assert.match(body.message, /The TCS of "Adult" in Suite must be an amount from 0 to/);
  assert.equal((await hotels('?status=all', { token: admin.token })).body.total, before);
});

test('an update that does not mention the tables leaves them alone; sending them replaces them; renaming an option works', async () => {
  const made = (await create()).data;
  const put = (json) => hotels(`/${made._id}`, as(sales, json, 'PUT'));
  const unrelated = (await put({ phone: '+91 98765 43210' })).body;
  assert.equal(unrelated.success, true, unrelated.message);
  assert.deepEqual(unrelated.data.priceTables.map((t) => t.name), ['Deluxe room', 'Suite']);
  const renamed = (await put({ priceTables: [{ ...made.priceTables[0], name: 'Garden view' }, made.priceTables[1]] })).body;
  assert.deepEqual(renamed.data.priceTables.map((t) => t.name), ['Garden view', 'Suite']);
  const refused = (await put({ priceTables: [{ name: 'X', rows: [row('Adult', { visa: -5 })] }] })).body;
  assert.equal(refused.success, false);
  assert.equal((await hotels(`/${made._id}`, { token: admin.token })).body.data.priceTables.length, 2, 'a refused update changed nothing');
  assert.deepEqual((await put({ priceTables: [] })).body.data.priceTables, []);
});

test('archiving and restoring a hotel keeps its tables', async () => {
  const made = (await create()).data;
  await hotels(`/${made._id}`, as(sales, { status: 'Archived' }, 'PUT'));
  await hotels(`/${made._id}`, as(sales, { status: 'Active' }, 'PUT'));
  assert.equal((await hotels(`/${made._id}`, { token: admin.token })).body.data.priceTables.length, 2);
});

test('a Viewer cannot change a hotel\'s prices', async () => {
  const made = (await create()).data;
  const denied = (await hotels(`/${made._id}`, as(viewer, { priceTables: [] }, 'PUT'))).body;
  assert.equal(denied.success, false);
  assert.match(denied.message, /Permission Denied/);
  assert.equal((await hotels(`/${made._id}`, { token: admin.token })).body.data.priceTables.length, 2);
});
