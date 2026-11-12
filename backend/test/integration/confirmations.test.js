import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// Quotation -> Confirmation: converting, the lock, the guest's status, booking details, cancelling, the list and who may do what.

let app;
let admin;
let sana; // Sales, assigned to the quotations she creates
let omar; // Ops, not assigned to them
let viewer;
let GuestModel;
let QuotationModel;
let ConfirmationModel;
let guestCounter = 0;

const quote = (path = '', opts = {}) => app.call(`/api/quotations${path}`, opts);
const conf = (path = '', opts = {}) => app.call(`/api/confirmations${path}`, opts);
const asAdmin = (json, method = 'POST') => ({ method, token: admin.token, json });

const stay = (name) => ({ city: 'Udaipur', hotelName: name, roomCategory: 'Deluxe', mealPlan: 'CP (Breakfast Only)', noOfRooms: '1 Room' });
const makeQuotation = async (over = {}, who = admin) => {
  const body = (await quote('', { method: 'POST', token: who.token, json: { clientName: 'Aarav Mehta', destination: 'RAJASTHAN', quotationType: 'Package', paxDetails: '2 Adults', status: 'Sent', pricing: { grandTotal: 120000, totalCostPerPerson: 60000 }, itinerary: [{ title: 'Arrival', description: 'Meet and greet' }], ...over } })).body;
  assert.equal(body.success, true, body.message);
  return body.data;
};
const makeGuest = async (status = 'Quoted') => {
  guestCounter += 1;
  return GuestModel.create({ srNo: `G-${guestCounter}`, inquiryDate: new Date(), guestNames: 'Aarav Mehta', contactNumber: '9999999999', destination: 'Rajasthan', travelDate: new Date('2027-03-01'), sales: 'Sana', ops: 'Omar', createdBy: 'test', status });
};
const confirm = async (quotation, extra = {}, who = admin) => (await conf('', { method: 'POST', token: who.token, json: { quotationId: quotation._id, ...extra } })).body;
const guestStatus = async (guest) => (await GuestModel.findById(guest._id)).status;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  sana = await app.makeUser('Sales');
  omar = await app.makeUser('Ops');
  viewer = await app.makeUser('Viewer');
  GuestModel = (await import('../../src/models/Guest.js')).default;
  QuotationModel = (await import('../../src/models/Quotation.js')).default;
  ConfirmationModel = (await import('../../src/models/Confirmation.js')).default;
});
after(async () => {
  await app.close();
});

test('converting a quotation keeps a frozen copy, pre-fills the amount, locks the quotation and moves the guest on', async () => {
  const guest = await makeGuest('Quoted');
  const q = await makeQuotation({ guestId: String(guest._id), travelDate: '2027-03-01' });
  const body = await confirm(q);
  assert.equal(body.success, true, body.message);
  const c = body.data;
  assert.match(c.confirmationNo, new RegExp(`^7H-CF-${new Date().getFullYear()}-\\d{3}$`));
  assert.match(body.message, /Booking confirmed as 7H-CF-/);
  assert.equal(c.status, 'Confirmed');
  assert.deepEqual([c.quotationNo, c.clientName, c.destination, c.quotationType, c.paxDetails], [q.quotationNo, 'Aarav Mehta', 'RAJASTHAN', 'Package', '2 Adults']);
  assert.equal(c.quote.itinerary[0].title, 'Arrival');
  assert.equal(c.quote.quotationNo, q.quotationNo, 'the copy keeps the quotation number it was sold under');
  assert.equal('confirmationId' in c.quote, false);
  assert.deepEqual([c.payment.totalAmount, c.payment.received, c.balance], [120000, 0, 120000]);
  assert.deepEqual([c.travellers, c.customFields, c.notes], [[], [], '']);

  const locked = (await quote(`/${q._id}`, { token: admin.token })).body.data;
  assert.deepEqual([locked.status, locked.isLocked, locked.confirmationId, locked.confirmationNo], ['Confirmed', true, c._id, c.confirmationNo]);
  assert.equal(await guestStatus(guest), 'Confirmed');
  assert.equal(c.previousGuestStatus, 'Quoted');
});

test('a quotation can be confirmed only once, and the second attempt says which confirmation it is', async () => {
  const q = await makeQuotation();
  const first = await confirm(q);
  assert.equal(first.success, true);
  const again = await confirm(q);
  assert.equal(again.success, false);
  assert.equal(again.message, `This quotation is already confirmed as ${first.data.confirmationNo}. Open that confirmation instead.`);
  assert.equal(await ConfirmationModel.countDocuments({ quotationId: q._id }), 1);
});

test('five people confirming the same quotation at the same moment create exactly one confirmation', async () => {
  const q = await makeQuotation();
  const results = await Promise.all(Array.from({ length: 5 }, () => confirm(q)));
  assert.equal(results.filter((r) => r.success).length, 1, JSON.stringify(results.map((r) => r.message)));
  for (const r of results.filter((x) => !x.success)) assert.match(r.message, /already confirmed|just confirmed/);
  assert.equal(await ConfirmationModel.countDocuments({ quotationId: q._id, status: 'Confirmed' }), 1);
  const stored = await QuotationModel.findById(q._id);
  assert.notEqual(stored.confirmationId, 'pending', 'the claim was completed');
  assert.ok(stored.confirmationNo);
});

test('different quotations confirmed at the same moment get different numbers', async () => {
  const qs = [];
  for (let i = 0; i < 4; i += 1) qs.push(await makeQuotation());
  const results = await Promise.all(qs.map((q) => confirm(q)));
  assert.ok(results.every((r) => r.success), JSON.stringify(results.map((r) => r.message)));
  assert.equal(new Set(results.map((r) => r.data.confirmationNo)).size, 4);
});

test('a confirmed quotation is locked for everyone: it cannot be changed or deleted, and a copy of it is open', async () => {
  const q = await makeQuotation();
  const c = (await confirm(q)).data;

  const edit = await quote(`/${q._id}`, asAdmin({ clientName: 'Someone else' }, 'PUT'));
  assert.equal(edit.body.success, false);
  assert.equal(edit.body.message, `This quotation is confirmed as ${c.confirmationNo} and is locked, so it cannot be changed. Open the confirmation to add booking details, or cancel the confirmation to change the quotation.`);
  const del = await quote(`/${q._id}`, { method: 'DELETE', token: admin.token });
  assert.match(del.body.message, /locked, so it cannot be deleted/);
  assert.equal((await QuotationModel.findById(q._id)).clientName, 'Aarav Mehta');
  assert.equal((await QuotationModel.findById(q._id)).deleted, false);

  const copy = (await quote(`/${q._id}/duplicate`, { method: 'POST', token: admin.token })).body.data;
  assert.deepEqual([copy.isLocked, copy.confirmationId, copy.confirmationNo, copy.status], [false, '', '', 'Draft']);
  assert.equal((await quote(`/${copy._id}`, asAdmin({ clientName: 'Editable' }, 'PUT'))).body.success, true);
});

test('the lock fields belong to the server: a request cannot set or clear them', async () => {
  const forged = await makeQuotation({ confirmationId: 'x', confirmationNo: '7H-CF-FAKE' });
  assert.deepEqual([forged.confirmationId, forged.confirmationNo], ['', '']);
  const q = await makeQuotation();
  const c = (await confirm(q)).data;
  const attempt = await quote(`/${q._id}`, asAdmin({ confirmationId: '', confirmationNo: '', isLocked: false }, 'PUT'));
  assert.equal(attempt.body.success, false, 'still locked');
  assert.equal((await QuotationModel.findById(q._id)).confirmationId, c._id);
});

test('quotations with hotel options need the accepted option; its hotels and price become the confirmation\'s', async () => {
  const q = await makeQuotation({
    options: [
      { name: 'Option A', hotels: [stay('Hotel A')], pricePerPerson: 30000, priceNote: 'Per person' },
      { name: 'Option B', hotels: [stay('Hotel B')], pricePerPerson: 45000, priceNote: 'Per person' }
    ]
  });
  const before = await confirm(q);
  assert.equal(before.success, false);
  assert.equal(before.message, 'This quotation offers 2 hotel options. Please choose the option the client accepted.');
  assert.equal((await QuotationModel.findById(q._id)).confirmationId, '', 'nothing was locked');

  assert.equal((await confirm(q, { optionIndex: 7 })).message, 'Please choose one of the 2 hotel options.');
  const ok = await confirm(q, { optionIndex: 1 });
  assert.equal(ok.success, true, ok.message);
  assert.equal(ok.data.optionName, 'Option B');
  assert.deepEqual(ok.data.quote.packageDetails.hotels.map((h) => h.hotelName), ['Hotel B']);
  assert.deepEqual(ok.data.quote.options, []);
  assert.equal(ok.data.payment.totalAmount, 90000, '45,000 per person x 2 adults');
  assert.equal(ok.data.quote.pricing.grandTotal, 90000);
  const stored = await QuotationModel.findById(q._id);
  assert.equal(stored.options.length, 2, 'the quotation itself still shows all the options it offered');
});

test('what cannot be confirmed is explained: cancelled or expired quotations, deleted ones, unknown ones, missing ids', async () => {
  const cancelled = await makeQuotation({ status: 'Cancelled' });
  assert.equal((await confirm(cancelled)).message, 'This quotation is cancelled. Change its status on the quotation before confirming it.');
  const expired = await makeQuotation({ status: 'Expired' });
  assert.match((await confirm(expired)).message, /This quotation is expired/);
  const gone = await makeQuotation();
  await quote(`/${gone._id}`, { method: 'DELETE', token: admin.token });
  assert.equal((await confirm(gone)).message, 'Quotation not found. It may have been deleted.');
  assert.equal((await conf('', asAdmin({ quotationId: '64b7f0f2a1b2c3d4e5f60718' }))).body.message, 'Quotation not found. It may have been deleted.');
  assert.equal((await conf('', asAdmin({}))).body.message, 'Quotation not found. It may have been deleted.');
  assert.equal((await conf('', asAdmin({ quotationId: { $ne: null } }))).body.message, 'Quotation not found. It may have been deleted.');
  assert.equal((await QuotationModel.findById(cancelled._id)).isLocked, false);
});

test('a guest who is already confirmed, paid or travelled is left as they are', async () => {
  for (const status of ['Confirmed', 'Confirmed & Payment received', 'Travelled']) {
    const guest = await makeGuest(status);
    const q = await makeQuotation({ guestId: String(guest._id) });
    const c = (await confirm(q)).data;
    assert.equal(await guestStatus(guest), status, status);
    assert.equal(c.previousGuestStatus, '');
  }
});

test('booking details are saved, validated in plain words, and the balance is always calculated', async () => {
  const q = await makeQuotation();
  const c = (await confirm(q)).data;
  const save = (json) => conf(`/${c._id}`, { method: 'PUT', token: admin.token, json });

  const ok = (await save({
    travelDate: '2027-04-10',
    travellers: [{ name: 'Aarav Mehta', age: 41, passportNo: 'Z1234567' }, { name: 'Anaya Mehta', age: '9' }],
    payment: { received: 40000, balanceDueDate: '2027-03-01', note: 'Advance by cheque' },
    notes: '<p><strong>Window seats</strong></p>',
    customFields: [{ label: 'Hotel voucher no', value: 'HV-7781' }]
  })).body;
  assert.equal(ok.success, true, ok.message);
  assert.equal(ok.message, 'Booking details saved.');
  assert.deepEqual([ok.data.payment.totalAmount, ok.data.payment.received, ok.data.balance], [120000, 40000, 80000]);
  assert.deepEqual(ok.data.travellers.map((t) => [t.name, t.age]), [['Aarav Mehta', 41], ['Anaya Mehta', 9]]);
  assert.equal(ok.data.customFields[0].value, 'HV-7781');
  assert.equal(ok.data.travelDate.slice(0, 10), '2027-04-10');
  assert.equal(ok.data.payment.balanceDueDate.slice(0, 10), '2027-03-01');

  const refused = [
    [{ payment: { received: 999999 } }, /cannot be more than the total amount \(Rs 1,20,000\)/],
    [{ travellers: [{ name: 'A' }, { name: '' }] }, /Please enter the name of traveller 2/],
    [{ customFields: [{ label: 'A', value: '1' }, { label: 'a', value: '2' }] }, /used twice/],
    [{ payment: { balanceDueDate: '2027-02-31' } }, /not a real date/],
    [{ notes: 'x'.repeat(6000) }, /notes is too long/i]
  ];
  for (const [json, message] of refused) {
    const r = (await save(json)).body;
    assert.equal(r.success, false, JSON.stringify(json).slice(0, 60));
    assert.match(r.message, message);
  }
  const stored = (await conf(`/${c._id}`, { token: admin.token })).body.data;
  assert.equal(stored.payment.received, 40000, 'a refused update changed nothing');
  assert.equal(stored.travellers.length, 2);
});

test('only the booking details can be edited: the status, the copy and the numbers cannot be set through an update', async () => {
  const q = await makeQuotation();
  const c = (await confirm(q)).data;
  const r = (await conf(`/${c._id}`, asAdmin({ status: 'Cancelled', confirmationNo: 'HACK', quote: { destination: 'ELSEWHERE' }, quotationId: 'x', clientName: 'Changed', notes: 'ok' }, 'PUT'))).body;
  assert.equal(r.success, true, r.message);
  assert.deepEqual([r.data.status, r.data.confirmationNo, r.data.quote.destination, r.data.clientName, r.data.notes], ['Confirmed', c.confirmationNo, 'RAJASTHAN', 'Aarav Mehta', 'ok']);
});

test('two people editing the same booking: the second save is refused, not silently merged', async () => {
  const q = await makeQuotation();
  const c = (await confirm(q)).data;
  const first = (await conf(`/${c._id}`, asAdmin({ notes: 'first', updatedAt: c.updatedAt }, 'PUT'))).body;
  assert.equal(first.success, true, first.message);
  const second = (await conf(`/${c._id}`, asAdmin({ notes: 'second', updatedAt: c.updatedAt }, 'PUT'))).body;
  assert.equal(second.success, false);
  assert.match(second.message, /was changed by .* while you were editing it/);
  assert.equal((await conf(`/${c._id}`, { token: admin.token })).body.data.notes, 'first');
  assert.equal((await conf(`/${c._id}`, asAdmin({ notes: 'bad', updatedAt: 'yesterday' }, 'PUT'))).body.success, false);
});

test('receiving the full amount moves the guest to "Confirmed & Payment received" (never the other way)', async () => {
  const guest = await makeGuest('Quoted');
  const q = await makeQuotation({ guestId: String(guest._id) });
  const c = (await confirm(q)).data;
  await conf(`/${c._id}`, asAdmin({ payment: { received: 50000 } }, 'PUT'));
  assert.equal(await guestStatus(guest), 'Confirmed', 'part payment: unchanged');
  await conf(`/${c._id}`, asAdmin({ payment: { received: 120000 } }, 'PUT'));
  assert.equal(await guestStatus(guest), 'Confirmed & Payment received');
  await conf(`/${c._id}`, asAdmin({ payment: { received: 10 } }, 'PUT'));
  assert.equal(await guestStatus(guest), 'Confirmed & Payment received', 'not moved back');
});

test('cancelling needs a reason, unlocks the quotation, restores the statuses, keeps the record, and allows confirming again', async () => {
  const guest = await makeGuest('Follow up');
  const q = await makeQuotation({ guestId: String(guest._id), status: 'Sent' });
  const c = (await confirm(q)).data;
  assert.equal(await guestStatus(guest), 'Confirmed');

  const noReason = (await conf(`/${c._id}/cancel`, asAdmin({}))).body;
  assert.equal(noReason.message, 'Please enter a reason for cancelling.');
  assert.equal((await conf(`/${c._id}`, { token: admin.token })).body.data.status, 'Confirmed');

  const done = (await conf(`/${c._id}/cancel`, asAdmin({ reason: '  Client postponed the trip ' }))).body;
  assert.equal(done.success, true, done.message);
  assert.match(done.message, new RegExp(`Booking ${c.confirmationNo} cancelled\\. The quotation can be edited again\\.`));
  assert.deepEqual([done.data.status, done.data.cancelReason], ['Cancelled', 'Client postponed the trip']);
  assert.ok(done.data.cancelledAt && done.data.cancelledByName);

  const open = (await quote(`/${q._id}`, { token: admin.token })).body.data;
  assert.deepEqual([open.status, open.isLocked, open.confirmationId, open.confirmationNo], ['Sent', false, '', '']);
  assert.equal(await guestStatus(guest), 'Follow up');
  assert.equal((await quote(`/${q._id}`, asAdmin({ destination: 'CHANGED' }, 'PUT'))).body.success, true, 'the quotation can be edited again');

  assert.equal((await conf(`/${c._id}/cancel`, asAdmin({ reason: 'again' }))).body.message, 'This confirmation was already cancelled.');
  assert.equal((await conf(`/${c._id}`, asAdmin({ notes: 'x' }, 'PUT'))).body.message, 'This confirmation was cancelled and can no longer be changed.');
  assert.equal((await conf(`/${c._id}`, { token: admin.token })).body.data.quote.destination, 'RAJASTHAN', 'the record still shows what was sold');

  const again = await confirm(q);
  assert.equal(again.success, true, again.message);
  assert.notEqual(again.data.confirmationNo, c.confirmationNo);
  assert.equal(again.data.quote.destination, 'CHANGED', 'the new confirmation copies the edited quotation');
  assert.equal(await ConfirmationModel.countDocuments({ quotationId: q._id }), 2);
});

test('cancelling does not reset a guest whose status moved on in the meantime', async () => {
  const guest = await makeGuest('Quoted');
  const q = await makeQuotation({ guestId: String(guest._id) });
  const c = (await confirm(q)).data;
  await GuestModel.updateOne({ _id: guest._id }, { $set: { status: 'Travelled' } });
  await conf(`/${c._id}/cancel`, asAdmin({ reason: 'test' }));
  assert.equal(await guestStatus(guest), 'Travelled');
});

test('the list searches, filters by status, pages, shows the balance and never carries the copy of the quotation', async () => {
  const a = (await confirm(await makeQuotation({ clientName: 'Zubin Searchable' }))).data;
  const b = (await confirm(await makeQuotation({ clientName: 'Other Person' }))).data;
  await conf(`/${a._id}`, asAdmin({ travellers: [{ name: 'Unique Traveller Name' }], payment: { received: 20000 } }, 'PUT'));
  await conf(`/${b._id}/cancel`, asAdmin({ reason: 'test' }));

  const byName = (await conf('?search=zubin searchable', { token: admin.token })).body;
  assert.deepEqual(byName.data.map((r) => r.confirmationNo), [a.confirmationNo]);
  assert.equal(byName.data[0].balance, 100000);
  assert.equal('quote' in byName.data[0], false, 'the list never carries the frozen copy');
  assert.equal('previousGuestStatus' in byName.data[0], false);
  assert.deepEqual((await conf('?search=unique traveller', { token: admin.token })).body.data.map((r) => r.confirmationNo), [a.confirmationNo]);
  assert.deepEqual((await conf(`?search=${b.confirmationNo}`, { token: admin.token })).body.data.map((r) => r.status), ['Cancelled']);
  assert.ok((await conf('?status=Cancelled', { token: admin.token })).body.data.every((r) => r.status === 'Cancelled'));
  assert.ok((await conf('?status=Confirmed', { token: admin.token })).body.data.every((r) => r.status === 'Confirmed'));
  assert.equal((await conf('?search=%5B%5D.*%28', { token: admin.token })).body.success, true, 'search text is taken literally');

  const page1 = (await conf('?limit=2&page=1', { token: admin.token })).body;
  const page2 = (await conf('?limit=2&page=2', { token: admin.token })).body;
  assert.equal(page1.data.length, 2);
  assert.ok(page1.total > 2 && page1.pages >= 2);
  assert.equal(page1.data.filter((r) => page2.data.some((s) => s._id === r._id)).length, 0, 'pages do not overlap');
  assert.equal((await conf('?limit=9999&page=-3', { token: admin.token })).body.limit, 50);
  assert.equal((await conf('/64b7f0f2a1b2c3d4e5f60718', { token: admin.token })).body.message, 'Confirmation not found.');
  assert.equal((await conf(`/${a.confirmationNo}`, { token: admin.token })).body.data._id, a._id, 'found by its number too');
});

test('who may do what: rights are enforced', async () => {
  const q = await makeQuotation({ sales: `${sana.user.firstName} ${sana.user.lastName}`, salesId: String(sana.user._id) });
  // A viewer can look but not confirm.
  assert.match((await conf('', { token: viewer.token })).body.data ? 'ok' : 'x', /ok/);
  const denied = (await conf('', { method: 'POST', token: viewer.token, json: { quotationId: q._id } })).body;
  assert.equal(denied.success, false);
  assert.match(denied.message, /Permission Denied/);
  assert.equal((await QuotationModel.findById(q._id)).confirmationId, '');

  // Sana (assigned) confirms; Omar (Ops, has canEditOthers) can read and edit it too — the confirmed-lock only
  // applies to quotation records, not to Confirmation documents (all of which have status 'Confirmed' by design).
  const c = (await confirm(q, {}, sana)).data;
  assert.ok(c, 'sales can confirm her own quotation');
  assert.equal((await conf(`/${c._id}`, { token: omar.token })).body.success, true);
  assert.equal((await conf(`/${c._id}`, { method: 'PUT', token: omar.token, json: { notes: 'x' } })).body.success, true);
  assert.equal((await conf(`/${c._id}`, { method: 'PUT', token: sana.token, json: { notes: 'mine' } })).body.success, true);
  assert.equal((await conf(`/${c._id}/cancel`, { method: 'POST', token: sana.token, json: { reason: 'client asked' } })).body.success, true);
});

test('without a token nothing is reachable', async () => {
  for (const [path, method] of [['', 'GET'], ['/abc', 'GET'], ['', 'POST'], ['/abc', 'PUT'], ['/abc/cancel', 'POST']]) {
    assert.equal((await conf(path, { method })).status, 401, `${method} ${path}`);
  }
});

// A request that dies between claiming the quotation and creating the confirmation (a restart at the wrong moment) must not leave the
// quotation locked for ever.
const strandedClaim = async (q, minutesAgo) =>
  QuotationModel.updateOne({ _id: q._id }, { $set: { status: 'Confirmed', isLocked: true, confirmationId: 'pending', updatedAt: new Date(Date.now() - minutesAgo * 60 * 1000) } }, { timestamps: false });

test('a claim left behind is released after a couple of minutes, when the quotations are listed', async () => {
  const q = await makeQuotation({ status: 'Sent' });
  await strandedClaim(q, 10);
  const listed = (await quote('', { token: admin.token })).body.data.find((x) => x._id === q._id);
  assert.deepEqual([listed.confirmationId, listed.isLocked, listed.status], ['', false, 'Sent']);
  assert.equal((await quote(`/${q._id}`, asAdmin({ destination: 'EDITABLE AGAIN' }, 'PUT'))).body.success, true);
  assert.equal((await confirm(q)).success, true, 'and it can be confirmed properly');
});

test('a claim made a moment ago is left alone: that confirmation is probably still being created', async () => {
  const q = await makeQuotation({ status: 'Sent' });
  await strandedClaim(q, 0);
  const listed = (await quote('', { token: admin.token })).body.data.find((x) => x._id === q._id);
  assert.equal(listed.confirmationId, 'pending');
  const again = await confirm(q);
  assert.equal(again.success, false);
  assert.match(again.message, /already confirmed/);
  assert.equal((await QuotationModel.findById(q._id)).confirmationId, 'pending');
});

test('a left-behind claim is also released when someone tries to confirm that quotation', async () => {
  const q = await makeQuotation({ status: 'Sent' });
  await strandedClaim(q, 10);
  const ok = await confirm(q);
  assert.equal(ok.success, true, ok.message);
  assert.equal((await QuotationModel.findById(q._id)).confirmationId, ok.data._id);
});

test('a left-behind claim whose confirmation was in fact created is linked to it, not unlocked', async () => {
  const q = await makeQuotation({ status: 'Sent' });
  const c = (await confirm(q)).data;
  await QuotationModel.updateOne({ _id: q._id }, { $set: { confirmationId: 'pending', confirmationNo: '', updatedAt: new Date(Date.now() - 10 * 60 * 1000) } }, { timestamps: false });
  const listed = (await quote('', { token: admin.token })).body.data.find((x) => x._id === q._id);
  assert.deepEqual([listed.confirmationId, listed.confirmationNo, listed.isLocked], [c._id, c.confirmationNo, true]);
});

test('someone who may create bookings but has no access to quotations cannot confirm one, and nothing is locked', async () => {
  const person = await app.makeUser('Sales');
  const q = await makeQuotation({ sales: `${person.user.firstName} ${person.user.lastName}`, salesId: String(person.user._id) });
  const setRight = (flags) => app.call('/api/rights', { method: 'POST', token: admin.token, json: { userId: String(person.user._id), module: 'quotations', ...flags } });
  assert.equal((await setRight({ canRead: false })).body.success, true);
  const refused = await confirm(q, {}, person);
  assert.equal(refused.success, false);
  assert.match(refused.message, /Permission Denied: You do not have 'Read' rights for quotations/);
  assert.equal((await QuotationModel.findById(q._id)).confirmationId, '');
  assert.equal((await setRight({ canRead: true })).body.success, true);
  assert.equal((await confirm(q, {}, person)).success, true, 'and once they may read quotations again they can');
});

test('the client\'s contact can be kept on the booking (the quotation stays locked and untouched), by those who may change the booking', async () => {
  const q = await makeQuotation({ clientPhone: '', clientEmail: '' });
  const c = (await confirm(q)).data;
  const put = (json, who = admin) => conf(`/${c._id}`, { method: 'PUT', token: who.token, json });
  const first = await put({ clientPhone: '+91 98765 43210', clientEmail: 'meera@example.com', updatedAt: c.updatedAt });
  assert.equal(first.body.success, true, first.body.message);
  assert.deepEqual([first.body.data.clientPhone, first.body.data.clientEmail], ['+91 98765 43210', 'meera@example.com']);
  const listed = (await conf(`?search=${encodeURIComponent('98765')}`, { token: admin.token })).body.data;
  assert.ok(listed.some((x) => x._id === c._id), 'the list finds the booking by the number kept on it');
  assert.equal((await QuotationModel.findById(q._id)).clientPhone, '', 'the locked quotation is not touched');

  const stale = await put({ clientPhone: '+91 90000 00000', updatedAt: c.updatedAt }); // the second save with the old version
  assert.equal(stale.body.success, false);
  assert.match(stale.body.message, /while you were editing it/);

  const cleared = await put({ clientPhone: '', updatedAt: first.body.data.updatedAt });
  assert.equal(cleared.body.success, true);
  assert.equal(cleared.body.data.clientPhone, '');
  assert.equal(cleared.body.data.clientEmail, 'meera@example.com', 'only what was sent changed');

  const refused = await put({ clientPhone: 'call me', updatedAt: cleared.body.data.updatedAt });
  assert.equal(refused.body.success, false);
  assert.match(refused.body.message, /phone number can only have digits/);

  const denied = await put({ clientPhone: '+91 90000 00000' }, viewer);
  assert.equal(denied.body.success, false);
  assert.match(denied.body.message, /Permission Denied/);
  assert.equal((await ConfirmationModel.findById(c._id)).clientPhone, '');
});

test('a cancelled booking keeps the contact it had: it can no longer be changed', async () => {
  const q = await makeQuotation({ clientPhone: '+91 98765 11111' });
  const c = (await confirm(q)).data;
  await conf(`/${c._id}/cancel`, asAdmin({ reason: 'The client changed their plans' }));
  const attempt = await conf(`/${c._id}`, { method: 'PUT', token: admin.token, json: { clientPhone: '+91 90000 00000' } });
  assert.equal(attempt.body.success, false);
  assert.match(attempt.body.message, /cancelled and can no longer be changed/);
  assert.equal((await ConfirmationModel.findById(c._id)).clientPhone, '+91 98765 11111');
});

test('what each hotel gave (its confirmation number, contact number and times) is saved with the booking, in order, and refused in plain words when wrong', async () => {
  const q = await makeQuotation({ packageDetails: { hotels: [stay('Hotel Sunrise'), stay('Hotel Moonlight')] } });
  const c = (await confirm(q)).data;
  assert.deepEqual(c.hotelBookings, [], 'a new booking starts with none');
  const save = (json) => conf(`/${c._id}`, { method: 'PUT', token: admin.token, json });

  const saved = (await save({ hotelBookings: [{ confirmationNo: 'HB-2291', contactNumber: '+91 294 242 8800', checkInTime: '14:00', checkOutTime: '11:00' }, { confirmationNo: 'MN-77', contactNumber: '', checkInTime: '12:00', checkOutTime: '' }] })).body;
  assert.equal(saved.success, true, saved.message);
  assert.deepEqual(saved.data.hotelBookings, [
    { confirmationNo: 'HB-2291', contactNumber: '+91 294 242 8800', checkInTime: '14:00', checkOutTime: '11:00' },
    { confirmationNo: 'MN-77', contactNumber: '', checkInTime: '12:00', checkOutTime: '' }
  ]);

  const refused = (await save({ hotelBookings: [{ checkInTime: '99:99' }] })).body;
  assert.equal(refused.success, false);
  assert.match(refused.message, /check-in time of hotel 1 must be a time like 14:00/);
  assert.equal((await conf(`/${c._id}`, { token: admin.token })).body.data.hotelBookings.length, 2, 'a refused save changes nothing');

  const other = (await save({ notes: 'only the notes' })).body;
  assert.equal(other.data.hotelBookings.length, 2, 'saving something else leaves the hotels\' details alone');
  assert.equal(other.data.quote.packageDetails.hotels.length, 2, 'the copy of the quotation is not touched');
});
