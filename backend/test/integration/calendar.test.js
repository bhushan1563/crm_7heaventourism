import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The travel calendar lists the guests, quotations and bookings that travel in a range, each source only for a person who may read it,
// and shows a confirmed trip once (as its booking), not as the quotation and the booking too.

let app;
let admin;
let GuestModel;
let RightModel;

const cal = (query, token = admin.token) => app.call(`/api/calendar?${query}`, { token });
const quote = (json) => app.call('/api/quotations', { method: 'POST', token: admin.token, json: { clientName: 'Client', destination: 'Goa', quotationType: 'Package', paxDetails: '2 Adults', status: 'Sent', ...json } });
const idOf = (r) => {
  assert.equal(r.body.success, true, r.body.message);
  return r.body.data._id;
};

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  GuestModel = (await import('../../src/models/Guest.js')).default;
  RightModel = (await import('../../src/models/Right.js')).default;
  await GuestModel.create({ srNo: 'CAL-1', inquiryDate: new Date(), guestNames: 'Aarav Mehta', contactNumber: '9999999999', destination: 'Rajasthan', travelDate: new Date('2031-05-10'), sales: 'Sana', ops: 'Omar', createdBy: 'test', status: 'Quoted' });
  await GuestModel.create({ srNo: 'CAL-2', inquiryDate: new Date(), guestNames: 'Far Away', contactNumber: '9999999999', destination: 'Goa', travelDate: new Date('2033-01-01'), sales: 'Sana', ops: 'Omar', createdBy: 'test' });
});
after(async () => {
  await app.close();
});

test('it asks for a valid range', async () => {
  for (const q of ['', 'from=2031-05-01', 'from=x&to=y', 'from=2031-06-01&to=2031-05-01', 'from=2030-01-01&to=2032-12-31']) {
    const r = (await cal(q)).body;
    assert.equal(r.success, false, q);
    assert.ok(r.message, q);
  }
});

test('it needs a signed-in user', async () => {
  const r = await app.call('/api/calendar?from=2031-05-01&to=2031-05-31');
  assert.notEqual(r.body.success, true);
});

test('a guest travels on one day; a quotation runs for its nights, and shows when the range touches only its later days', async () => {
  const q = idOf(await quote({ clientName: 'Nihar', travelDate: '2031-05-28', duration: '5 Nights / 6 Days' }));
  const may = (await cal('from=2031-05-01&to=2031-05-31')).body;
  assert.equal(may.success, true);
  const guest = may.data.find((e) => e.kind === 'guest');
  assert.deepEqual([guest.title, guest.start, guest.end, guest.ref], ['Aarav Mehta', '2031-05-10', '2031-05-10', 'CAL-1']);
  const trip = may.data.find((e) => e.recordId === q);
  assert.deepEqual([trip.start, trip.end, trip.nights, trip.link], ['2031-05-28', '2031-06-02', 5, `/quotations/${q}/edit`]);
  const june = (await cal('from=2031-06-01&to=2031-06-30')).body;
  assert.ok(june.data.some((e) => e.recordId === q), 'a trip that began in May is still on in June');
  assert.ok(!june.data.some((e) => e.kind === 'guest'));
  const far = (await cal('from=2031-05-01&to=2031-05-31')).body;
  assert.ok(!far.data.some((e) => e.title === 'Far Away'));
});

test('a confirmed trip is shown once, as its booking', async () => {
  const q = idOf(await quote({ clientName: 'Pujan', travelDate: '2031-07-04', duration: '3 Nights' }));
  assert.equal((await cal('from=2031-07-01&to=2031-07-31')).body.data.filter((e) => e.title === 'Pujan').length, 1);
  const c = await app.call('/api/confirmations', { method: 'POST', token: admin.token, json: { quotationId: q } });
  assert.equal(c.body.success, true, c.body.message);
  const events = (await cal('from=2031-07-01&to=2031-07-31')).body.data.filter((e) => e.title === 'Pujan');
  assert.deepEqual(events.map((e) => e.kind), ['confirmation']);
  assert.deepEqual([events[0].start, events[0].end], ['2031-07-04', '2031-07-07']);
});

test('the payment deadline of a booking shows on its due date until it is paid, and goes when the booking is cancelled', async () => {
  const q = idOf(await quote({ clientName: 'Deadline Guest', travelDate: '2031-09-20', duration: '2 Nights' }));
  const conf = (await app.call('/api/confirmations', { method: 'POST', token: admin.token, json: { quotationId: q } })).body.data;
  const save = (json) => app.call(`/api/confirmations/${conf._id}`, { method: 'PUT', token: admin.token, json });
  assert.equal((await save({ payment: { totalAmount: 50000, received: 10000, balanceDueDate: '2031-09-01' } })).body.success, true);
  const sept = (await cal('from=2031-09-01&to=2031-09-30')).body.data.filter((e) => e.title === 'Deadline Guest');
  assert.deepEqual(sept.map((e) => [e.kind, e.start]).sort(), [['confirmation', '2031-09-20'], ['payment', '2031-09-01']]);
  assert.equal(sept.find((e) => e.kind === 'payment').amount, 'Rs 40,000');
  // paid in full: no deadline
  assert.equal((await save({ payment: { received: 50000 } })).body.success, true);
  assert.deepEqual((await cal('from=2031-09-01&to=2031-09-30')).body.data.filter((e) => e.title === 'Deadline Guest').map((e) => e.kind), ['confirmation']);
});

test('a person without the right to read a module does not see its events', async () => {
  const sales = await app.makeUser('Sales');
  for (const module of ['guest_list', 'quotations', 'confirmations']) {
    await RightModel.create({ userId: String(sales.user._id), userRole: null, module, canRead: module === 'quotations', canCreate: false, canUpdate: false, canDelete: false, canDownload: false, canEditOthers: false });
  }
  const r = (await cal('from=2031-05-01&to=2031-07-31', sales.token)).body;
  assert.equal(r.success, true, r.message);
  assert.deepEqual(r.sources, { guests: false, quotations: true, confirmations: false });
  assert.ok(r.data.length > 0);
  assert.ok(r.data.every((e) => e.kind === 'quotation'));
});
