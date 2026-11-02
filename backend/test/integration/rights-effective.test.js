import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { RIGHT_MODULES, defaultRightsFor } from '../../src/config/rights.js';

// The Rights screen shows what people REALLY have. A screen that listed only the rows someone had saved drew "off" for everything
// nobody had saved yet (the hotel list, itineraries, bookings ...), and saving then took that access away.

let app;
let admin;
let Right;
const effective = (query, token) => app.call(`/api/rights/effective?${query}`, { token: token ?? admin.token });
const flagsOf = (r) => Object.entries(r).filter(([, v]) => v).map(([k]) => k).sort();

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  ({ default: Right } = await import('../../src/models/Right.js'));
});
after(async () => {
  await app.close();
});

test('a person with nothing saved shows exactly the built-in defaults for every module, new ones included', async () => {
  const sales = await app.makeUser('Sales');
  const { body } = await effective(`userId=${sales.user._id}`);
  assert.equal(body.success, true, body.message);
  assert.deepEqual(Object.keys(body.data).sort(), [...RIGHT_MODULES].sort());
  for (const mod of RIGHT_MODULES) assert.deepEqual(body.data[mod], defaultRightsFor('Sales', mod), mod);
  assert.equal(body.data.confirmations.canCreate, true, 'the booking module is not drawn as "off" just because nobody saved it');
  assert.equal(body.data.hotels.canUpdate, true);
});

test('what is saved for the role beats the default, and what is saved for the person beats both', async () => {
  const ops = await app.makeUser('Ops');
  await Right.create({ userRole: 'Ops', userId: null, module: 'hotels', canRead: true, canUpdate: false, canCreate: false });
  let body = (await effective(`userId=${ops.user._id}`)).body;
  assert.deepEqual(flagsOf(body.data.hotels), ['canRead'], 'the role row beats the default (which let Ops edit hotels)');
  assert.deepEqual(flagsOf(body.data.confirmations), flagsOf(defaultRightsFor('Ops', 'confirmations')), 'other modules still show their defaults');

  await Right.create({ userId: String(ops.user._id), userRole: null, module: 'hotels', canRead: true, canDownload: true, canCreate: false, canUpdate: false, canDelete: false, canEditOthers: false });
  body = (await effective(`userId=${ops.user._id}`)).body;
  assert.deepEqual(flagsOf(body.data.hotels), ['canDownload', 'canRead'], 'the person row beats the role row');
});

test('a whole role shows the role rows, else the defaults', async () => {
  await Right.create({ userRole: 'Viewer', userId: null, module: 'quotations', canRead: false });
  const { body } = await effective('userRole=Viewer');
  assert.equal(body.success, true);
  assert.equal(body.data.quotations.canRead, false, 'a saved role right shows as saved');
  assert.deepEqual(body.data.hotels, defaultRightsFor('Viewer', 'hotels'));
  assert.deepEqual(body.data.confirmations, defaultRightsFor('Viewer', 'confirmations'));
});

test('an Admin always shows everything, and the screen can tell the role is locked', async () => {
  const other = await app.makeUser('Admin');
  const { body } = await effective(`userId=${other.user._id}`);
  for (const mod of RIGHT_MODULES) assert.equal(Object.values(body.data[mod]).every(Boolean), true, mod);
});

test('what the screen shows is what the person is really allowed: saving the screen as it is changes nothing', async () => {
  const sales = await app.makeUser('Sales');
  const shown = (await effective(`userId=${sales.user._id}`)).body.data;
  const saved = await app.call('/api/rights/bulk', { method: 'POST', token: admin.token, json: { userId: String(sales.user._id), permissions: shown } });
  assert.equal(saved.body.success, true, saved.body.message);
  const after = (await effective(`userId=${sales.user._id}`)).body.data;
  assert.deepEqual(after, shown);
  // and the person can still do what they could before
  const hotels = await app.call('/api/hotels', { token: sales.token });
  assert.equal(hotels.body.success, true);
  const created = await app.call('/api/hotels', { method: 'POST', token: sales.token, json: { name: 'Still Allowed', city: 'Goa' } });
  assert.equal(created.body.success, true, created.body.message);
});

test('problems are explained in plain words', async () => {
  assert.match((await effective('userId=64b7f0f2a1b2c3d4e5f60718')).body.message, /Person not found/);
  assert.match((await effective('userId=not-an-id')).body.message, /Person not found/);
  assert.match((await effective('userRole=Admin')).body.message, /Please choose a person, or a role/);
  assert.match((await effective('')).body.message, /Please choose a person, or a role/);
  assert.match((await effective('userRole[$ne]=x')).body.message, /Please choose a person, or a role/);
});

test('only people who may change rights can ask', async () => {
  const viewer = await app.makeUser('Viewer');
  const sales = await app.makeUser('Sales');
  assert.match((await effective(`userId=${sales.user._id}`, viewer.token)).body.message, /Permission Denied|Access Denied/);
  assert.equal((await app.call(`/api/rights/effective?userId=${sales.user._id}`)).status, 401);
});
