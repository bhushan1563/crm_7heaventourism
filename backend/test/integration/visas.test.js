import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The visa list: saved once, found again, never duplicated, archived rather than destroyed, and guarded by its own rights.

let app;
let admin;
let sales;
let omar;
let viewer;
const visas = (path = '', opts = {}) => app.call(`/api/visas${path}`, opts);
const as = (who, json, method = 'POST') => ({ method, token: who.token, json });
const uae = (over = {}) => ({
  country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days',
  fees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }], documents: ['Passport valid for 6 months', 'Photos'], inclusions: ['Form filling'], priceNote: 'Fees may change', ...over
});

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  sales = await app.makeUser('Sales');
  omar = await app.makeUser('Ops');
  viewer = await app.makeUser('Viewer');
});
after(async () => {
  await app.close();
});

test('a visa is saved with its details, usual fees, checklist and inclusions, and read back', async () => {
  const made = (await visas('', as(sales, uae()))).body;
  assert.equal(made.success, true, made.message);
  assert.equal(made.message, 'Visa saved to the visa list.');
  const d = made.data;
  assert.deepEqual([d.country, d.visaType, d.entryType, d.mode, d.validity, d.stay, d.processingTime, d.status], ['United Arab Emirates', 'Tourist', 'Single entry', 'e-Visa', '60 days', '30 days', '3 to 5 working days', 'Active']);
  assert.deepEqual(d.fees.map((f) => [f.label, f.amount, f.per]), [['Visa fee', 6500, 'applicant'], ['Courier', 800, 'group']]);
  assert.deepEqual(d.documents, ['Passport valid for 6 months', 'Photos']);
  assert.equal('nameKey' in d || 'deleted' in d, false, 'bookkeeping stays inside');
  assert.deepEqual((await visas(`/${d._id}`, { token: viewer.token })).body.data.documents, d.documents);
});

test('the same visa cannot be added twice, however it is typed, and an archived one says where to find it', async () => {
  const again = (await visas('', as(omar, uae({ country: '  UNITED   arab emirates ', visaType: 'tourist', entryType: 'Single entry' })))).body;
  assert.equal(again.success, false);
  assert.match(again.message, /The United Arab Emirates, Tourist, Single entry visa is already in the visa list\. Search for it instead of adding it again\./);
  assert.equal((await visas('', as(omar, uae({ entryType: 'Multiple entry' })))).body.success, true, 'another entry type is another visa');
  const first = (await visas('?search=single', { token: admin.token })).body.data[0];
  await visas(`/${first._id}`, as(admin, { status: 'Archived' }, 'PUT'));
  assert.match((await visas('', as(omar, uae()))).body.message, /archived\. Open the Archived tab and restore it instead/);
});

test('problems are explained in plain words and nothing is saved', async () => {
  const before = (await visas('?status=all', { token: admin.token })).body.total;
  const cases = [
    [{ ...uae(), country: '' }, /Please enter the country this visa is for/],
    [uae({ visaType: 'Study', entryType: 'Whenever' }), /Please choose the entry type from the list/],
    [uae({ visaType: 'Study', fees: [{ label: '', amount: 1 }] }), /Please enter a name for fee 1/],
    [uae({ visaType: 'Study', documents: ['x'.repeat(1500)] }), /The documents checklist, item 1/]
  ];
  for (const [json, message] of cases) {
    const body = (await visas('', as(sales, json))).body;
    assert.equal(body.success, false);
    assert.match(body.message, message);
  }
  assert.equal((await visas('?status=all', { token: admin.token })).body.total, before);
});

test('hostile markup is removed from the checklist and the price note', async () => {
  const body = (await visas('', as(sales, uae({ country: 'France', documents: ['<p onclick="x()"><strong>Bold</strong></p><script>alert(1)</script>'], priceNote: '<p><img src=x onerror=alert(1)>Note</p>' })))).body;
  assert.equal(body.success, true, body.message);
  assert.deepEqual(body.data.documents, ['<p><strong>Bold</strong></p>']);
  assert.ok(!/img|onerror/.test(body.data.priceNote), body.data.priceNote);
});

test('the list searches, shows what it needs and not the checklist, and pages', async () => {
  for (const country of ['Singapore', 'Thailand', 'Japan']) await visas('', as(sales, uae({ country })));
  const found = (await visas('?search=singa', { token: viewer.token })).body;
  assert.deepEqual(found.data.map((v) => v.country), ['Singapore']);
  assert.equal('documents' in found.data[0], false, 'the checklist stays in the database');
  assert.equal(found.data[0].documentCount, 2);
  assert.ok(found.data[0].fees.length === 2);
  assert.equal((await visas('?search=%5B%5D.*%28', { token: admin.token })).body.success, true, 'search text is taken literally');
  const page1 = (await visas('?limit=2&page=1', { token: admin.token })).body;
  const page2 = (await visas('?limit=2&page=2', { token: admin.token })).body;
  assert.equal(page1.data.length, 2);
  assert.ok(page1.pages >= 2);
  assert.equal(page1.data.filter((v) => page2.data.some((w) => w._id === v._id)).length, 0);
  assert.equal((await visas('?limit=9999', { token: admin.token })).body.limit, 50);
  const names = (await visas('?limit=50', { token: admin.token })).body.data.map((v) => v.country);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'sorted by country');
});

test('changing a visa keeps the rest, archiving and restoring only change the status, and two people cannot overwrite each other', async () => {
  const made = (await visas('', as(sales, uae({ country: 'Vietnam' })))).body.data;
  const edit = (json) => visas(`/${made._id}`, as(sales, json, 'PUT'));
  const changed = (await edit({ validity: '90 days', updatedAt: made.updatedAt })).body;
  assert.equal(changed.success, true, changed.message);
  assert.deepEqual([changed.data.validity, changed.data.country, changed.data.fees.length], ['90 days', 'Vietnam', 2]);
  const stale = (await edit({ validity: '10 days', updatedAt: made.updatedAt })).body;
  assert.equal(stale.success, false);
  assert.match(stale.message, /was changed by .* while you were editing it/);
  assert.equal((await edit({ status: 'Archived' })).body.data.status, 'Archived');
  assert.equal((await visas('?search=vietnam', { token: admin.token })).body.total, 0, 'archived visas leave the default list');
  assert.equal((await visas('?search=vietnam&status=Archived', { token: admin.token })).body.total, 1);
  assert.equal((await edit({ status: 'Active' })).body.data.status, 'Active');
  assert.match((await edit({ country: '' })).body.message, /Please enter the country/);
  assert.match((await edit({ updatedAt: 'yesterday' })).body.message, /while you were editing/);
});

test('renaming a visa onto another one is refused', async () => {
  const a = (await visas('', as(sales, uae({ country: 'Egypt' })))).body.data;
  const b = (await visas('', as(sales, uae({ country: 'Jordan' })))).body.data;
  const clash = (await visas(`/${b._id}`, as(sales, { country: 'Egypt' }, 'PUT'))).body;
  assert.equal(clash.success, false);
  assert.match(clash.message, /Egypt, Tourist, Single entry visa is already in the visa list/);
  assert.equal((await visas(`/${a._id}`, { token: admin.token })).body.data.country, 'Egypt');
});

test('deleting hides the visa; only an Admin may delete by default', async () => {
  const made = (await visas('', as(sales, uae({ country: 'Oman' })))).body.data;
  assert.match((await visas(`/${made._id}`, { method: 'DELETE', token: sales.token })).body.message, /Permission Denied/);
  assert.equal((await visas(`/${made._id}`, { method: 'DELETE', token: admin.token })).body.success, true);
  assert.match((await visas(`/${made._id}`, { token: admin.token })).body.message, /Visa not found/);
  assert.equal((await visas('', as(sales, uae({ country: 'Oman' })))).body.success, true, 'a deleted visa can be added again');
});

test('who may do what: Sales and Ops can work on the list, a Viewer can only look, and everyone must sign in', async () => {
  assert.equal((await visas('', as(omar, uae({ country: 'Qatar' })))).body.success, true);
  assert.match((await visas('', as(viewer, uae({ country: 'Kuwait' })))).body.message, /Permission Denied/);
  assert.equal((await visas('', { token: viewer.token })).body.success, true);
  const made = (await visas('', as(admin, uae({ country: 'Bahrain' })))).body.data;
  assert.match((await visas(`/${made._id}`, as(viewer, { validity: '1' }, 'PUT'))).body.message, /Permission Denied/);
  for (const [path, method] of [['', 'GET'], ['/abc', 'GET'], ['', 'POST'], ['/abc', 'PUT'], ['/abc', 'DELETE']]) assert.equal((await visas(path, { method })).status, 401, `${method} ${path}`);
  assert.match((await visas('/not-an-id', { token: admin.token })).body.message, /Visa not found/);
});
