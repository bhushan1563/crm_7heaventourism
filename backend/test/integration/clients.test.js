import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The clients page: the current clients (one per person, from the guest list and the bookings) and the future clients, kept by hand.

let app;
let admin;
let GuestModel;
let RightModel;

const get = (path, token = admin.token) => app.call(`/api/clients${path}`, { token });
const send = (method, path, json, token = admin.token) => app.call(`/api/clients${path}`, { method, token, json });

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  GuestModel = (await import('../../src/models/Guest.js')).default;
  RightModel = (await import('../../src/models/Right.js')).default;
  const base = { inquiryDate: new Date(), destination: 'Goa', travelDate: new Date('2031-05-10'), sales: 'Sana', ops: 'Omar', createdBy: 'test' };
  await GuestModel.create({ ...base, srNo: 'CL-1', guestNames: 'Aarav Mehta', email: 'aarav@example.com', contactNumber: '+91 98765 43210' });
  await GuestModel.create({ ...base, srNo: 'CL-2', guestNames: 'Aarav M.', email: 'AARAV@example.com', contactNumber: '09876543210', destination: 'Kerala' });
  await GuestModel.create({ ...base, srNo: 'CL-3', guestNames: 'Deleted One', email: 'gone@example.com', contactNumber: '90000 00000', deleted: true });
});
after(async () => {
  await app.close();
});

test('the current clients are one entry per person, with every e-mail address and number, and deleted inquiries are left out', async () => {
  const r = (await get('/current')).body;
  assert.equal(r.success, true, r.message);
  assert.deepEqual(r.sources, { guests: true, confirmations: true });
  const names = r.data.map((c) => c.name);
  assert.ok(!names.includes('Deleted One'));
  const aarav = r.data.find((c) => c.emails.length);
  assert.equal(aarav.inquiries, 2);
  assert.equal(aarav.phones.length, 1);
});

test('the clients need a signed-in user', async () => {
  const r = await app.call('/api/clients/current');
  assert.notEqual(r.body.success, true);
  const r2 = await app.call('/api/clients/future');
  assert.notEqual(r2.body.success, true);
});

test('a future client is added, listed, changed and removed', async () => {
  const created = (await send('POST', '/future', { name: ' Meera  Joshi ', phone: '+91 98765 11111', email: 'meera@example.com', destination: 'Bali', expectedTravel: 'December 2031', source: 'Instagram' })).body;
  assert.equal(created.success, true, created.message);
  assert.equal(created.data.name, 'Meera Joshi');
  const id = created.data._id;
  assert.ok(created.data.createdByName !== undefined);

  const listed = (await get('/future')).body;
  assert.equal(listed.success, true);
  assert.ok(listed.data.some((c) => c._id === id));

  const saved = (await send('PUT', `/future/${id}`, { budget: '3 lakh', phone: '+91 98765 22222' })).body;
  assert.equal(saved.success, true, saved.message);
  assert.equal(saved.data.budget, '3 lakh');
  assert.equal(saved.data.phone, '+91 98765 22222');
  assert.equal(saved.data.name, 'Meera Joshi', 'what was not sent stays');

  const removed = (await send('DELETE', `/future/${id}`)).body;
  assert.equal(removed.success, true, removed.message);
  assert.ok(!(await get('/future')).body.data.some((c) => c._id === id));
  assert.equal((await send('DELETE', `/future/${id}`)).body.success, false);
});

test('bad details are refused in words, and nothing is saved', async () => {
  const before = (await get('/future')).body.count;
  for (const json of [{}, { name: 'A', phone: 'call me' }, { name: 'A', email: 'nope' }]) {
    const r = (await send('POST', '/future', json)).body;
    assert.equal(r.success, false);
    assert.ok(r.message);
  }
  assert.equal((await get('/future')).body.count, before);
  const id = (await send('POST', '/future', { name: 'Keep me' })).body.data._id;
  assert.equal((await send('PUT', `/future/${id}`, { name: '' })).body.success, false);
  assert.equal((await send('PUT', '/future/not-an-id', { name: 'X' })).body.success, false);
});

test('only whoever added a future client (or an admin) may change or remove it, and the guest list rights apply', async () => {
  const owner = await app.makeUser('Sales');
  const other = await app.makeUser('Sales');
  const grant = (user, flags) => RightModel.create({ userId: String(user.user._id), userRole: null, module: 'guest_list', canRead: true, canCreate: false, canUpdate: false, canDelete: false, canDownload: false, canEditOthers: false, ...flags });
  await grant(owner, { canCreate: true, canUpdate: true, canDelete: true });
  await grant(other, { canUpdate: true, canDelete: true });

  const id = (await send('POST', '/future', { name: 'Owned' }, owner.token)).body.data._id;
  assert.equal((await send('POST', '/future', { name: 'Not allowed' }, other.token)).body.success, false, 'no right to add');
  assert.equal((await send('PUT', `/future/${id}`, { notes: 'mine' }, other.token)).body.success, false, 'not theirs');
  assert.equal((await send('DELETE', `/future/${id}`, undefined, other.token)).body.success, false, 'not theirs');
  assert.equal((await send('PUT', `/future/${id}`, { notes: 'mine' }, owner.token)).body.success, true);
  assert.equal((await send('DELETE', `/future/${id}`, undefined, owner.token)).body.success, true);
});
