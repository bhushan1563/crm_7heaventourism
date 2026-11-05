import { startDbApp } from './helpers-db.js';
import mongoose from 'mongoose';
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

test('a booking made earlier from an old quotation (its frozen copy has no notes or policies) is shown with the standard ones', async () => {
  const q = await legacy('OLD-005');
  const made = (await app.call('/api/confirmations', { method: 'POST', token: admin.token, json: { quotationId: String(q._id) } })).body;
  assert.equal(made.success, true, made.message);
  // As bookings confirmed before the fix were stored: the copy holds none of the lists.
  await ConfirmationModel.updateOne({ _id: made.data._id }, { $set: Object.fromEntries(STANDARD_TEXT_KEYS.map((k) => [`quote.${k}`, []])) });
  const stored = await ConfirmationModel.findById(made.data._id).lean();
  assert.deepEqual(listsOf(stored.quote), Object.fromEntries(STANDARD_TEXT_KEYS.map((k) => [k, []])));

  const shown = (await app.call(`/api/confirmations/${made.data._id}`, { token: admin.token })).body;
  assert.equal(shown.success, true, shown.message);
  assert.deepEqual(listsOf(shown.data.quote), STANDARD_TEXT);
  assert.equal(shown.data.clientName, 'Aarav Mehta');
  assert.equal(shown.data.payment.totalAmount, 50000);
  assert.equal(shown.data.balance, 50000);
  // Saving the booking details sends back the same, and stores nothing new in the copy.
  const saved = (await app.call(`/api/confirmations/${made.data._id}`, { method: 'PUT', token: admin.token, json: { payment: { received: 10000 } } })).body;
  assert.equal(saved.success, true, saved.message);
  assert.deepEqual(listsOf(saved.data.quote), STANDARD_TEXT);
  assert.deepEqual(listsOf((await ConfirmationModel.findById(made.data._id).lean()).quote), Object.fromEntries(STANDARD_TEXT_KEYS.map((k) => [k, []])));
});

test('a booking made from a full quotation keeps its own itinerary, hotels, inclusions and notes exactly', async () => {
  const q = await legacy('NEW-001', {
    itinerary: [{ dayNumber: 'Day 01', title: 'Arrival in Goa', description: 'Meet and greet' }],
    packageDetails: { hotels: [{ hotelName: 'Sea View Resort', city: 'Goa', nights: '3 Nights' }], inclusions: ['Daily breakfast'] },
    exclusions: ['Airfare'], importantNotes: ['Carry your ID'], paymentPolicy: ['25% now'], cancellationPolicy: ['10% fee'], vehicleNotes: ['AC off on ghats']
  });
  const made = (await app.call('/api/confirmations', { method: 'POST', token: admin.token, json: { quotationId: String(q._id) } })).body;
  assert.equal(made.success, true, made.message);
  const shown = (await app.call(`/api/confirmations/${made.data._id}`, { token: admin.token })).body.data.quote;
  assert.equal(shown.itinerary[0].title, 'Arrival in Goa');
  assert.equal(shown.packageDetails.hotels[0].hotelName, 'Sea View Resort');
  assert.deepEqual(shown.packageDetails.inclusions, ['Daily breakfast']);
  assert.deepEqual(shown.exclusions, ['Airfare']);
  assert.deepEqual(shown.importantNotes, ['Carry your ID']);
  assert.deepEqual(shown.paymentPolicy, ['25% now']);
});

test('a booking does not show prices on its voucher until it is told to, and the choice is kept', async () => {
  const q = await legacy('PRICE-001');
  const made = (await app.call('/api/confirmations', { method: 'POST', token: admin.token, json: { quotationId: String(q._id) } })).body;
  assert.equal(made.success, true, made.message);
  assert.equal(made.data.showPricing, false, 'off to start with');
  const id = made.data._id;
  const save = (json) => app.call(`/api/confirmations/${id}`, { method: 'PUT', token: admin.token, json });

  assert.equal((await save({ showPricing: 'yes' })).body.success, false, 'anything but true or false is refused');
  const on = (await save({ showPricing: true })).body;
  assert.equal(on.success, true, on.message);
  assert.equal(on.data.showPricing, true);
  assert.equal((await app.call(`/api/confirmations/${id}`, { token: admin.token })).body.data.showPricing, true);
  assert.equal((await save({ payment: { received: 1000 } })).body.data.showPricing, true, 'saving something else leaves it as it was');
  assert.equal((await save({ showPricing: false })).body.data.showPricing, false);
  assert.equal(((await app.call(`/api/confirmations/${id}`, { token: admin.token })).body.data.payment.totalAmount), 50000, 'the amounts are still kept');

  // A booking made before the switch existed has no value stored: it is off.
  await ConfirmationModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { showPricing: '' } });
  const old = (await app.call(`/api/confirmations/${id}`, { token: admin.token })).body.data;
  assert.ok(!old.showPricing);
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
