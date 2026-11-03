import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The sender number: set by an Admin on the Rights & Security screen, carried in the messages the person sends to clients.

let app;
let admin;
let sales;
let ops;
let viewer;

const setNumber = (userId, senderNumber, who = admin) => app.call(`/api/rights/sender-number/${userId}`, { method: 'PUT', token: who.token, json: { senderNumber } });
const me = async (who) => (await app.call('/api/auth/me', { token: who.token })).body.user;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  sales = await app.makeUser('Sales');
  ops = await app.makeUser('Ops');
  viewer = await app.makeUser('Viewer');
});
after(async () => {
  await app.close();
});

test('a person starts with no sender number', async () => {
  assert.equal((await me(sales)).senderNumber, '');
});

test('an Admin sets it, it is stored in one canonical form, and the person sees it when they sign in', async () => {
  const res = await setNumber(sales.user._id, '98765 43210');
  assert.equal(res.body.success, true, res.body.message);
  assert.equal(res.body.data.senderNumber, '+919876543210');
  assert.match(res.body.message, /The sender number of Test Sales\d+ is now \+919876543210\./);
  assert.equal((await me(sales)).senderNumber, '+919876543210');
});

test('it can be changed and removed again, and removing says the company number will be used', async () => {
  assert.equal((await setNumber(sales.user._id, '+971 50 123 4567')).body.data.senderNumber, '+971501234567');
  const cleared = await setNumber(sales.user._id, '');
  assert.equal(cleared.body.success, true);
  assert.equal(cleared.body.data.senderNumber, '');
  assert.match(cleared.body.message, /was removed\. Their messages will carry the company number\./);
  assert.equal((await me(sales)).senderNumber, '');
});

test('a number that cannot be right is refused in plain words and nothing changes', async () => {
  await setNumber(ops.user._id, '9000000001');
  for (const bad of ['12345', 'call me', '0000000000', '<script>']) {
    const res = await setNumber(ops.user._id, bad);
    assert.equal(res.body.success, false, bad);
    assert.ok(res.body.message.length > 10);
  }
  assert.equal((await me(ops)).senderNumber, '+919000000001');
});

test('only someone with the right to change rights can set it: Sales, Ops and Viewers cannot, not even their own', async () => {
  for (const who of [sales, ops, viewer]) {
    const own = await setNumber(who.user._id, '9111111111', who);
    assert.equal(own.body.success, false);
    assert.match(own.body.message, /Permission Denied/);
    const other = await setNumber(admin.user._id, '9111111111', who);
    assert.equal(other.body.success, false);
    assert.match(other.body.message, /Permission Denied/);
  }
  assert.equal((await me(admin)).senderNumber, '');
  assert.equal((await me(viewer)).senderNumber, '');
});

test('without a session it is refused', async () => {
  const res = await app.call(`/api/rights/sender-number/${sales.user._id}`, { method: 'PUT', json: { senderNumber: '9111111111' } });
  assert.equal(res.status, 401);
});

test('"by rights": once the Rights screen is granted to a person, they can set it too', async () => {
  const grant = await app.call('/api/rights/bulk', { method: 'POST', token: admin.token, json: { userId: String(ops.user._id), permissions: { rights: { canRead: true, canUpdate: true } } } });
  assert.equal(grant.body.success, true, grant.body.message);
  const res = await setNumber(viewer.user._id, '9222222222', ops);
  assert.equal(res.body.success, true, res.body.message);
  assert.equal((await me(viewer)).senderNumber, '+919222222222');
});

test('it cannot be set through the profile or the user edit, only here', async () => {
  const profile = await app.call('/api/auth/profile', { method: 'PUT', token: sales.token, json: { firstName: 'A', lastName: 'B', phone: '9000000000', senderNumber: '9333333333' } });
  assert.equal(profile.body.success, true);
  assert.equal((await me(sales)).senderNumber, '', 'a person cannot give themselves a sender number');
  await app.call(`/api/users/${viewer.user._id}`, { method: 'PUT', token: admin.token, json: { firstName: 'V', senderNumber: '9444444444' } });
  assert.equal((await me(viewer)).senderNumber, '+919222222222', 'the user edit does not touch it');
});

test('an unknown, malformed or deleted person is "could not be found"', async () => {
  for (const id of ['not-an-id', '64b64b64b64b64b64b64b64b']) {
    const res = await setNumber(id, '9555555555');
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'That person could not be found.');
  }
  const gone = await app.makeUser('Sales', { deleted: true });
  assert.equal((await setNumber(gone.user._id, '9555555555')).body.message, 'That person could not be found.');
});

test('a request that does not carry a number, or carries something that is not one, is refused and never removes the number', async () => {
  for (const body of [{}, { $ne: '' }, ['9876543210'], { senderNumber: { $gt: '' } }, { senderNumber: ['9876543210'] }, { number: '9876543210' }]) {
    const res = await app.call(`/api/rights/sender-number/${ops.user._id}`, { method: 'PUT', token: admin.token, json: body });
    assert.equal(res.body.success, false, JSON.stringify(body));
    assert.ok(res.body.message.length > 10);
  }
  assert.equal((await me(ops)).senderNumber, '+919000000001', 'still there after every refused request');
});
