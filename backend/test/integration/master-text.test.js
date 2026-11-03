import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The standard Notes and Policy texts: read by everyone who makes quotations, changed only by an Admin, never touching a quotation
// that was already made.

let app;
let admin;
let sales;
let viewer;

const api = (path = '', opts = {}) => app.call(`/api/master-text${path}`, opts);
const lists = (over = {}) => ({
  importantNotes: ['All guests must carry a valid photo ID.'],
  paymentPolicy: ['30% advance at booking.', '<p><strong>Balance 15 days before arrival.</strong></p>'],
  cancellationPolicy: ['Free cancellation up to 30 days before.'],
  exclusions: ['Airfare unless specified.'],
  vehicleNotes: ['Kilometres are counted garage to garage.'],
  ...over
});

before(async () => {
  app = await startDbApp();
  [admin, sales, viewer] = await Promise.all(['Admin', 'Sales', 'Viewer'].map((r) => app.makeUser(r)));
});
after(async () => {
  await app.close();
});

test('before anything is saved there is no standard text of our own: the built-in text is in use, and anyone who reads quotations can ask', async () => {
  for (const who of [admin, sales, viewer]) {
    const r = (await api('', { token: who.token })).body;
    assert.equal(r.success, true, r.message);
    assert.equal(r.data, null);
  }
});

test('nobody signed out can read or change it', async () => {
  assert.equal((await api('', {})).status, 401);
  assert.equal((await api('', { method: 'PUT', json: lists() })).status, 401);
  assert.equal((await api('/reset', { method: 'POST' })).status, 401);
});

test('only an Admin can change it; everyone else is told plainly, and nothing is saved', async () => {
  for (const who of [sales, viewer]) {
    const put = (await api('', { method: 'PUT', token: who.token, json: lists() })).body;
    assert.equal(put.success, false);
    assert.match(put.message, /Permission Denied|Access Denied/);
    const reset = (await api('/reset', { method: 'POST', token: who.token })).body;
    assert.equal(reset.success, false);
  }
  assert.equal((await api('', { token: admin.token })).body.data, null);
});

test('an Admin saves it, and everyone then reads it back in order, with who saved it', async () => {
  const saved = (await api('', { method: 'PUT', token: admin.token, json: lists() })).body;
  assert.equal(saved.success, true, saved.message);
  assert.match(saved.message, /New quotations will start with them/);
  for (const who of [admin, sales, viewer]) {
    const r = (await api('', { token: who.token })).body.data;
    assert.deepEqual(r.paymentPolicy, ['30% advance at booking.', '<p><strong>Balance 15 days before arrival.</strong></p>']);
    assert.deepEqual(r.importantNotes, ['All guests must carry a valid photo ID.']);
    assert.equal(r.updatedByName, `${admin.user.firstName} ${admin.user.lastName}`.trim());
    assert.ok(r.updatedAt);
  }
});

test('saving again replaces the text (one record, never two), and a list can be emptied on purpose', async () => {
  const second = (await api('', { method: 'PUT', token: admin.token, json: lists({ vehicleNotes: [], exclusions: ['Only this.'] }) })).body;
  assert.equal(second.success, true, second.message);
  const r = (await api('', { token: viewer.token })).body.data;
  assert.deepEqual(r.vehicleNotes, []);
  assert.deepEqual(r.exclusions, ['Only this.']);
  const { default: MasterTextModel } = await import('../../src/models/MasterText.js');
  assert.equal(await MasterTextModel.countDocuments({}), 1);
});

test('a request that leaves a list out is refused in plain words and changes nothing', async () => {
  const before = (await api('', { token: admin.token })).body.data;
  const body = lists();
  delete body.paymentPolicy;
  const r = (await api('', { method: 'PUT', token: admin.token, json: body })).body;
  assert.equal(r.success, false);
  assert.match(r.message, /The payment policy is missing/);
  assert.deepEqual((await api('', { token: admin.token })).body.data, before);
  const wrong = (await api('', { method: 'PUT', token: admin.token, json: lists({ exclusions: 'nope' }) })).body;
  assert.equal(wrong.success, false);
  assert.match(wrong.message, /exclusions must be a list/);
});

test('formatted text is cleaned: script, handlers and links are never stored', async () => {
  const r = (await api('', { method: 'PUT', token: admin.token, json: lists({ importantNotes: ['<p onclick="x()">Hello <script>alert(1)</script><a href="javascript:x()">link</a></p>'] }) })).body;
  assert.equal(r.success, true, r.message);
  assert.deepEqual((await api('', { token: viewer.token })).body.data.importantNotes, ['<p>Hello link</p>']);
});

test('two Admins editing at once: the second save is refused until they reload', async () => {
  const seen = (await api('', { token: admin.token })).body.data.updatedAt;
  const first = (await api('', { method: 'PUT', token: admin.token, json: { ...lists({ exclusions: ['By the first.'] }), updatedAt: seen } })).body;
  assert.equal(first.success, true, first.message);
  const stale = (await api('', { method: 'PUT', token: admin.token, json: { ...lists({ exclusions: ['By the second.'] }), updatedAt: seen } })).body;
  assert.equal(stale.success, false);
  assert.match(stale.message, /were changed by .* while you were editing/);
  assert.deepEqual((await api('', { token: viewer.token })).body.data.exclusions, ['By the first.']);
});

test('a quotation that was already made keeps its own text, whatever the standard text becomes', async () => {
  const made = (await app.call('/api/quotations', { method: 'POST', token: admin.token, json: { clientName: 'Aarav', destination: 'GOA', paxDetails: '2 Adults', paymentPolicy: ['The old payment line.'], importantNotes: ['The old note.'] } })).body;
  assert.equal(made.success, true, made.message);
  const changed = (await api('', { method: 'PUT', token: admin.token, json: lists({ paymentPolicy: ['A brand new payment line.'] }) })).body;
  assert.equal(changed.success, true, changed.message);
  const again = (await app.call(`/api/quotations/${made.data._id}`, { token: admin.token })).body.data;
  assert.deepEqual(again.paymentPolicy, ['The old payment line.']);
  assert.deepEqual(again.importantNotes, ['The old note.']);
});

test('going back to the built-in text removes the saved record, and only an Admin can', async () => {
  const reset = (await api('/reset', { method: 'POST', token: admin.token })).body;
  assert.equal(reset.success, true, reset.message);
  assert.match(reset.message, /back to the built-in text/);
  assert.equal((await api('', { token: viewer.token })).body.data, null);
  assert.equal((await api('/reset', { method: 'POST', token: admin.token })).body.success, true, 'resetting twice is fine');
});

test('hostile requests never cause a server error', async () => {
  for (const json of [null, [], 'text', 5, { importantNotes: { $gt: '' } }, lists({ vehicleNotes: [{ $ne: 1 }] }), lists({ paymentPolicy: [null, 5, ['x']] }), { ...lists(), $set: { key: 'other' } }]) {
    const r = await api('', { method: 'PUT', token: admin.token, json });
    assert.ok(r.status < 500, `${JSON.stringify(json)} -> ${r.status}`);
  }
});
