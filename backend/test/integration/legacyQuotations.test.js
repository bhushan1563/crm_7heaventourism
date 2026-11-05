import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_TEXT, STANDARD_TEXT_KEYS } from '../../src/utils/standardText.js';

// A quotation brought in from the old export has only the client, the dates and the price: no notes, policies or exclusions. It must open,
// copy and confirm with the company's standard text, like a quotation made in the app. (What the old export never had, the itinerary and
// the hotels, is not made up.)

let app;
let admin;
let QuotationModel;
let ConfirmationModel;
let MasterTextModel;

const legacy = (no, over = {}) => QuotationModel.create({
  quotationNo: no, quotationType: 'Package', clientName: 'Aarav Mehta', destination: 'Goa', duration: '3 Nights', paxDetails: '2 Adults', travelDate: new Date('2031-06-10'), status: 'Sent',
  sales: 'Sana', ops: 'Omar', createdBy: String(admin.user._id), createdByName: 'Admin', salesId: null, opsId: null,
  pricing: { totalCostPerPerson: 25000, grandTotal: 50000, totalCostNote: 'Rs 25,000 Per person (Incl of GST)' }, ...over
});
const listsOf = (q) => Object.fromEntries(STANDARD_TEXT_KEYS.map((key) => [key, q[key]]));

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  QuotationModel = (await import('../../src/models/Quotation.js')).default;
  ConfirmationModel = (await import('../../src/models/Confirmation.js')).default;
  MasterTextModel = (await import('../../src/models/MasterText.js')).default;
});
after(async () => {
  await app.close();
});

test('an old quotation opens, and is listed, with the standard notes and policies', async () => {
  const q = await legacy('OLD-001');
  assert.deepEqual(listsOf(q.toObject()), Object.fromEntries(STANDARD_TEXT_KEYS.map((k) => [k, []])), 'stored with none, as the import left it');

  const one = (await app.call(`/api/quotations/${q._id}`, { token: admin.token })).body;
  assert.equal(one.success, true, one.message);
  assert.deepEqual(listsOf(one.data), STANDARD_TEXT);
  assert.equal(one.data.pricing.grandTotal, 50000, 'the rest is as it was');
  assert.deepEqual(one.data.itinerary, [], 'no itinerary is made up');

  const list = (await app.call('/api/quotations', { token: admin.token })).body;
  assert.deepEqual(listsOf(list.data.find((x) => x.quotationNo === 'OLD-001')), STANDARD_TEXT);
  assert.deepEqual(listsOf((await QuotationModel.findById(q._id).lean())), Object.fromEntries(STANDARD_TEXT_KEYS.map((k) => [k, []])), 'reading changes nothing in the database');
});

test('a quotation that has its own notes is shown exactly as it is', async () => {
  const q = await legacy('OWN-001', { importantNotes: ['Only my note'] });
  const one = (await app.call(`/api/quotations/${q._id}`, { token: admin.token })).body.data;
  assert.deepEqual(one.importantNotes, ['Only my note']);
  assert.deepEqual(one.exclusions, []);
  assert.deepEqual(one.paymentPolicy, []);
});

test('the copy of an old quotation starts with the standard notes and policies', async () => {
  const q = await legacy('OLD-002');
  const copy = (await app.call(`/api/quotations/${q._id}/duplicate`, { method: 'POST', token: admin.token })).body;
  assert.equal(copy.success, true, copy.message);
  const saved = await QuotationModel.findById(copy.data._id).lean();
  assert.deepEqual(listsOf(saved), STANDARD_TEXT);
  assert.equal(saved.clientName, 'Aarav Mehta (Copy)');
  assert.equal(saved.pricing.grandTotal, 50000);
  assert.equal(saved.status, 'Draft');
});

test('confirming an old quotation keeps the standard notes and policies on the booking', async () => {
  const q = await legacy('OLD-003');
  const made = (await app.call('/api/confirmations', { method: 'POST', token: admin.token, json: { quotationId: String(q._id) } })).body;
  assert.equal(made.success, true, made.message);
  const stored = await ConfirmationModel.findById(made.data._id).lean();
  assert.deepEqual(listsOf(stored.quote), STANDARD_TEXT);
  assert.equal(stored.payment.totalAmount, 50000);
});

test('the company\'s own saved text is used when there is one, list by list', async () => {
  await MasterTextModel.create({ key: 'quotation-text', importantNotes: ['Carry your ID.'], paymentPolicy: ['Half now, half later.'] });
  try {
    const q = await legacy('OLD-004');
    const one = (await app.call(`/api/quotations/${q._id}`, { token: admin.token })).body.data;
    assert.deepEqual(one.importantNotes, ['Carry your ID.']);
    assert.deepEqual(one.paymentPolicy, ['Half now, half later.']);
    assert.deepEqual(one.cancellationPolicy, STANDARD_TEXT.cancellationPolicy, 'a list the company left empty uses the built-in text');
    const copy = (await app.call(`/api/quotations/${q._id}/duplicate`, { method: 'POST', token: admin.token })).body;
    assert.deepEqual((await QuotationModel.findById(copy.data._id).lean()).importantNotes, ['Carry your ID.']);
  } finally {
    await MasterTextModel.deleteMany({});
  }
});
