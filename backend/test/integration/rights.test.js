import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { RIGHT_FLAGS, RIGHT_MODULES, allRights, defaultRightsFor } from '../../src/config/rights.js';

let app;
let admin;
let sales;
let ops;
let viewer;
let Right;

const matrix = async () => (await app.call('/api/rights/matrix', { token: admin.token })).body;
const rowOf = async (user) => (await matrix()).data.find((row) => row.user._id === String(user.user._id));
const post = (path, json, token = admin.token) => app.call(path, { method: 'POST', token, json });
const flags = (value) => Object.fromEntries(RIGHT_FLAGS.map((f) => [f, Boolean(value[f])]));

before(async () => {
  app = await startDbApp();
  [admin, sales, ops, viewer] = await Promise.all(['Admin', 'Sales', 'Ops', 'Viewer'].map((role) => app.makeUser(role)));
  ({ default: Right } = await import('../../src/models/Right.js'));
});
after(async () => {
  await app.close();
});

test('the rights screen loads for an Admin: every module is listed and the Admin row is fully allowed', async () => {
  const body = await matrix();
  assert.equal(body.success, true, body.message);
  const row = await rowOf(admin);
  assert.deepEqual(Object.keys(row.permissions), RIGHT_MODULES);
  for (const module of RIGHT_MODULES) assert.deepEqual(row.permissions[module], allRights(), `Admin ${module}`);
  assert.ok('hotels' in row.permissions && 'itineraries' in row.permissions, 'the new modules appear on the rights screen');
});

test('with nothing stored, people get the built-in defaults for their role', async () => {
  for (const person of [sales, ops, viewer]) {
    const row = await rowOf(person);
    for (const module of RIGHT_MODULES) assert.deepEqual(row.permissions[module], defaultRightsFor(person.user.role, module), `${person.user.role} ${module}`);
  }
  const salesRow = await rowOf(sales);
  assert.equal(salesRow.permissions.hotels.canCreate, true, 'Sales can add hotels out of the box');
  assert.equal(salesRow.permissions.hotels.canDelete, false, 'but never delete them');
  assert.equal(salesRow.permissions.quotations.canCreate, false, 'quotations stay read-only until an Admin grants more');
  assert.equal((await rowOf(viewer)).permissions.hotels.canCreate, false);
});

test('only people with rights-update permission can read or change the rights', async () => {
  for (const person of [sales, ops, viewer]) {
    const read = await app.call('/api/rights/matrix', { token: person.token });
    assert.equal(read.body.success, false);
    assert.match(read.body.message, /Permission Denied/);
    const write = await post('/api/rights', { userId: String(person.user._id), module: 'rights', canUpdate: true, canCreate: true }, person.token);
    assert.equal(write.body.success, false, 'nobody can give themselves more access');
  }
  assert.equal((await app.call('/api/rights/matrix')).status, 401);
});

test('a single change that leaves a flag out switches it OFF (and read stays on); the new rule applies to that role', async () => {
  const r = await post('/api/rights', { userRole: 'Viewer', module: 'hotels', canUpdate: true });
  assert.equal(r.body.success, true, r.body.message);
  assert.deepEqual(flags(r.body.data), { canCreate: false, canRead: true, canUpdate: true, canDelete: false, canDownload: false, canEditOthers: false });
  assert.deepEqual(flags((await rowOf(viewer)).permissions.hotels), flags(r.body.data));
  // other roles are untouched
  assert.deepEqual((await rowOf(ops)).permissions.hotels, defaultRightsFor('Ops', 'hotels'));
  await Right.deleteMany({});
});

test('a person and a role cannot be given in the same request, and unknown modules or roles are refused', async () => {
  const both = await post('/api/rights', { userId: String(sales.user._id), userRole: 'Sales', module: 'hotels', canCreate: true });
  assert.equal(both.body.success, false);
  assert.match(both.body.message, /either a person or a role, not both/);
  const bothBulk = await post('/api/rights/bulk', { userId: String(sales.user._id), userRole: 'Sales', permissions: { hotels: { canCreate: true } } });
  assert.match(bothBulk.body.message, /either a person or a role, not both/);

  assert.match((await post('/api/rights', { userRole: 'Sales', module: 'nope' })).body.message, /Invalid module, user or role/);
  assert.match((await post('/api/rights', { userRole: 'Admin', module: 'hotels' })).body.message, /Invalid module, user or role/);
  assert.match((await post('/api/rights', { userId: { $ne: null }, module: 'hotels' })).body.message, /Invalid module, user or role/);
  assert.match((await post('/api/rights/bulk', { userRole: 'Admin', permissions: { hotels: {} } })).body.message, /Admin access stays unrestricted/);
  assert.equal(await Right.countDocuments(), 0, 'nothing was saved by any of the refused requests');
});

test('a bulk save with one broken entry saves nothing at all', async () => {
  const r = await post('/api/rights/bulk', { userRole: 'Ops', permissions: { hotels: { canUpdate: true, canDelete: true }, itineraries: null } });
  assert.equal(r.body.success, false);
  assert.match(r.body.message, /permissions for 'itineraries' are not valid\. Nothing was saved\./);
  assert.equal(await Right.countDocuments(), 0);

  const array = await post('/api/rights/bulk', { userRole: 'Ops', permissions: { hotels: [] } });
  assert.equal(array.body.success, false);
  assert.equal(await Right.countDocuments(), 0);

  const none = await post('/api/rights/bulk', { userRole: 'Ops', permissions: { unknown_module: { canRead: true } } });
  assert.match(none.body.message, /No valid modules/);
});

test('saving the rights of one person changes only that person; a role save is copied to every member of that role', async () => {
  const other = await app.makeUser('Sales');
  const one = await post('/api/rights/bulk', { userId: String(sales.user._id), permissions: { hotels: { canRead: true, canDelete: true } } });
  assert.equal(one.body.success, true, one.body.message);
  assert.equal((await rowOf(sales)).permissions.hotels.canDelete, true);
  assert.deepEqual((await rowOf(other)).permissions.hotels, defaultRightsFor('Sales', 'hotels'), 'another Sales user is unaffected');

  const role = await post('/api/rights/bulk', { userRole: 'Sales', permissions: { quotations: { canRead: true, canCreate: true } } });
  assert.equal(role.body.success, true, role.body.message);
  assert.match(role.body.message, /Role rights saved for Sales\. \d+ members? updated\./);
  assert.equal((await rowOf(other)).permissions.quotations.canCreate, true);
  assert.equal((await rowOf(sales)).permissions.quotations.canCreate, true);
  assert.equal((await rowOf(sales)).permissions.hotels.canDelete, true, 'the earlier personal setting is still there');
  await Right.deleteMany({});
});

test('a row saved for one person is never mistaken for a role setting, even if it carries a role name', async () => {
  const mine = await app.makeUser('Sales');
  const theirs = await app.makeUser('Sales');
  // How an old or hand-edited record could look: tied to one person AND labelled with the role. It takes reading away.
  await Right.collection.insertOne({ userId: String(mine.user._id), userRole: 'Sales', module: 'itineraries', canCreate: false, canRead: false, canUpdate: false, canDelete: false, canDownload: false, canEditOthers: false });
  assert.equal((await rowOf(mine)).permissions.itineraries.canRead, false, 'it applies to that person');
  assert.deepEqual((await rowOf(theirs)).permissions.itineraries, defaultRightsFor('Sales', 'itineraries'), 'and to nobody else');
  // What the API actually enforces agrees with the rights screen.
  assert.match((await app.call('/api/itineraries', { token: mine.token })).body.message, /Permission Denied/);
  assert.equal((await app.call('/api/itineraries', { token: theirs.token })).body.success, true);
  await Right.deleteMany({});
});

test('a session token whose id is not a plain 24-character id is refused before it touches the database', async () => {
  const sign = (id) => jwt.sign({ id }, app.config.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
  for (const id of [{ $ne: null }, 12345, ['a'], null, '', 'not-an-id', 'z'.repeat(24), '0'.repeat(24)]) {
    const r = await app.call('/api/rights/matrix', { token: sign(id) });
    assert.equal(r.status, 401, JSON.stringify(id));
    assert.equal(r.body.success, false);
  }
  assert.equal((await app.call('/api/rights/matrix', { token: 'garbage' })).status, 401);
});
