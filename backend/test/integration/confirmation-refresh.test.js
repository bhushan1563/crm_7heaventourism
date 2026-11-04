import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// A booking is a frozen copy of the quotation as it was sold, and a confirmed quotation is locked. To change what was sold, the booking is
// cancelled, the quotation changed, and the quotation confirmed again: the new booking must show the changed quotation, in every part.

let app;
let admin;
let QuotationModel;

const quote = (path = '', opts = {}) => app.call(`/api/quotations${path}`, opts);
const conf = (path = '', opts = {}) => app.call(`/api/confirmations${path}`, opts);
const stay = (name) => ({ city: 'Dehradun', hotelName: name, roomCategory: 'Deluxe', mealPlan: 'CP (Breakfast Only)', noOfRooms: '1 Room' });

const makeQuotation = async (over = {}) => {
  const body = (await quote('', { method: 'POST', token: admin.token, json: { clientName: 'Saurabh Doshi', destination: 'UTTARAKHAND', quotationType: 'Package', paxDetails: '19 Adults', duration: '4 Nights / 5 Days', travelDate: '2026-11-12', status: 'Sent', packageDetails: { hotels: [stay('Hotel Ganga')] }, pricing: { grandTotal: 465500, totalCostPerPerson: 24500 }, ...over } })).body;
  assert.equal(body.success, true, body.message);
  return body.data;
};
const confirm = async (q, extra = {}) => (await conf('', { method: 'POST', token: admin.token, json: { quotationId: q._id, ...extra } })).body;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  QuotationModel = (await import('../../src/models/Quotation.js')).default;
});
after(async () => {
  await app.close();
});

test('a confirmed quotation cannot be changed, not even by an administrator, and the message says how to change it', async () => {
  const q = await makeQuotation();
  await confirm(q);
  const r = (await quote(`/${q._id}`, { method: 'PUT', token: admin.token, json: { paxDetails: '22 Adults' } })).body;
  assert.equal(r.success, false);
  assert.match(r.message, /locked.*cancel the confirmation to change the quotation/);
});

test('cancel, change the quotation, confirm again: the new booking shows the changed quotation in every part', async () => {
  const q = await makeQuotation();
  const first = (await confirm(q)).data;
  assert.deepEqual([first.paxDetails, first.payment.totalAmount, first.quote.packageDetails.hotels.length], ['19 Adults', 465500, 1]);
  assert.equal((await conf(`/${first._id}/cancel`, { method: 'POST', token: admin.token, json: { reason: 'The group grew' } })).body.success, true);

  const changed = (await quote(`/${q._id}`, { method: 'PUT', token: admin.token, json: { paxDetails: '22 Adults', destination: 'UTTARAKHAND & RISHIKESH', duration: '5 Nights / 6 Days', travelDate: '2026-12-20', packageDetails: { hotels: [stay('Hotel Ganga'), stay('Hotel Himalaya')] }, pricing: { grandTotal: 539000, totalCostPerPerson: 24500 } } })).body;
  assert.equal(changed.success, true, changed.message);

  const second = (await confirm(q)).data;
  assert.notEqual(second._id, first._id);
  assert.deepEqual([second.paxDetails, second.destination, second.duration], ['22 Adults', 'UTTARAKHAND & RISHIKESH', '5 Nights / 6 Days']);
  assert.equal(new Date(second.travelDate).toISOString().slice(0, 10), '2026-12-20');
  assert.equal(second.payment.totalAmount, 539000);
  assert.deepEqual(second.quote.packageDetails.hotels.map((h) => h.hotelName), ['Hotel Ganga', 'Hotel Himalaya']);
  assert.equal(second.quote.pricing.grandTotal, 539000);
  // the cancelled booking keeps what was sold at the time, and the quotation points at the new one
  const old = (await conf(`/${first._id}`, { token: admin.token })).body.data;
  assert.equal(old.status, 'Cancelled');
  assert.equal(old.paxDetails, '19 Adults');
  const quotation = await QuotationModel.findById(q._id);
  assert.equal(quotation.confirmationId, String(second._id));
  assert.equal(quotation.isLocked, true);
});

test('the booking carries every part of the quotation it was made from: itinerary, hotels, inclusions, policies and pricing', async () => {
  const q = await makeQuotation({ itinerary: [{ dayNumber: 'Day 1', title: 'Arrival in Dehradun', description: 'Check in.', photos: [] }], importantNotes: ['Carry an ID'], paymentPolicy: ['25% advance'], cancellationPolicy: ['10% after 30 days'], exclusions: ['Airfare'], packageDetails: { hotels: [stay('Hotel Ganga')], inclusions: ['Breakfast daily'], roomInfo: '10 rooms' } });
  const c = (await confirm(q)).data;
  assert.equal(c.quote.itinerary[0].title, 'Arrival in Dehradun');
  assert.deepEqual(c.quote.importantNotes, ['Carry an ID']);
  assert.deepEqual(c.quote.paymentPolicy, ['25% advance']);
  assert.deepEqual(c.quote.cancellationPolicy, ['10% after 30 days']);
  assert.deepEqual(c.quote.exclusions, ['Airfare']);
  assert.deepEqual(c.quote.packageDetails.inclusions, ['Breakfast daily']);
  assert.equal(c.quote.packageDetails.roomInfo, '10 rooms');
  assert.equal(c.quote.clientName, 'Saurabh Doshi');
});
