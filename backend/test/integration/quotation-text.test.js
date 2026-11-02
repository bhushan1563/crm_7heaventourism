import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// Every short free text printed on a quotation can be formatted, is cleaned on the server, and plain text is left exactly as typed.

let app;
let admin;
const api = (path, opts = {}) => app.call(`/api/quotations${path}`, opts);
const create = async (json) => (await api('', { method: 'POST', token: admin.token, json: { clientName: 'Aarav', destination: 'GOA', quotationType: 'Package', ...json } })).body;
const stay = (name) => ({ city: 'Goa', hotelName: name, roomCategory: 'Deluxe' });
const rich = (text) => `<p><strong>${text}</strong></p>`;
const hostile = '<p onclick="x()"><strong>Bold</strong></p><script>alert(1)</script>';

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
});
after(async () => {
  await app.close();
});

test('the price line, pricing notes, room allocation, flight note and end-of-tour banner keep their formatting', async () => {
  const body = await create({
    pricing: { totalCostNote: rich('Rs 60,000 per person'), notes: '<ul><li>GST extra</li></ul>', grandTotal: 120000, totalCostPerPerson: 60000 },
    packageDetails: { roomInfo: rich('1 Double + 1 Twin'), hotels: [], inclusions: [] },
    flightTicketNote: rich('As per ticket'),
    endOfTourNote: rich('End of the Tour')
  });
  assert.equal(body.success, true, body.message);
  const d = body.data;
  assert.equal(d.pricing.totalCostNote, rich('Rs 60,000 per person'));
  assert.equal(d.pricing.notes, '<ul><li>GST extra</li></ul>');
  assert.equal(d.pricing.grandTotal, 120000, 'the rest of the pricing is untouched');
  assert.equal(d.packageDetails.roomInfo, rich('1 Double + 1 Twin'));
  assert.equal(d.flightTicketNote, rich('As per ticket'));
  assert.equal(d.endOfTourNote, rich('End of the Tour'));
});

test('hostile markup in any of them is removed on the way in', async () => {
  const body = await create({ pricing: { totalCostNote: hostile, notes: hostile, grandTotal: 1 }, packageDetails: { roomInfo: hostile, hotels: [] }, flightTicketNote: hostile, endOfTourNote: hostile });
  assert.equal(body.success, true, body.message);
  const d = body.data;
  for (const value of [d.pricing.totalCostNote, d.pricing.notes, d.packageDetails.roomInfo, d.flightTicketNote, d.endOfTourNote]) assert.equal(value, '<p><strong>Bold</strong></p>');
});

test('plain text is stored exactly as it was typed', async () => {
  const body = await create({ pricing: { totalCostNote: 'Rs 0 Per person (Incl of GST)', notes: 'Line one\nLine two', grandTotal: 0 }, packageDetails: { roomInfo: '2 Rooms', hotels: [] }, flightTicketNote: 'Flight details will be as per confirmed flight ticket', endOfTourNote: '***End of the Tour***' });
  const d = body.data;
  assert.deepEqual([d.pricing.totalCostNote, d.pricing.notes, d.packageDetails.roomInfo, d.flightTicketNote, d.endOfTourNote], ['Rs 0 Per person (Incl of GST)', 'Line one\nLine two', '2 Rooms', 'Flight details will be as per confirmed flight ticket', '***End of the Tour***']);
});

test('an update that does not mention them leaves them alone; sending them replaces them', async () => {
  const made = (await create({ pricing: { totalCostNote: rich('keep me'), grandTotal: 5 }, endOfTourNote: rich('the end') })).data;
  const statusOnly = (await api(`/${made._id}`, { method: 'PUT', token: admin.token, json: { status: 'Sent' } })).body;
  assert.equal(statusOnly.data.pricing.totalCostNote, rich('keep me'));
  assert.equal(statusOnly.data.endOfTourNote, rich('the end'));
  const changed = (await api(`/${made._id}`, { method: 'PUT', token: admin.token, json: { endOfTourNote: 'plain now', pricing: { ...made.pricing, totalCostNote: 'plain price' } } })).body;
  assert.deepEqual([changed.data.endOfTourNote, changed.data.pricing.totalCostNote], ['plain now', 'plain price']);
});

test('problems are explained in plain words and nothing is saved', async () => {
  const before = (await api('', { token: admin.token })).body.count;
  const cases = [
    [{ pricing: { totalCostNote: 'x'.repeat(400) } }, /The price line is too long/],
    [{ packageDetails: { roomInfo: 'x'.repeat(400), hotels: [] } }, /The room allocation is too long/],
    [{ endOfTourNote: 'x'.repeat(400) }, /The end-of-tour note is too long/],
    [{ flightTicketNote: { $ne: 1 } }, /flight ticket note must be text/i]
  ];
  for (const [json, message] of cases) {
    const body = await create(json);
    assert.equal(body.success, false, JSON.stringify(json).slice(0, 60));
    assert.match(body.message, message);
  }
  assert.equal((await api('', { token: admin.token })).body.count, before);
});

test('hotel option price notes, vehicle notes and the trip and visa price notes keep their formatting too', async () => {
  const options = await create({ options: [{ name: 'A', hotels: [stay('Hotel A')], pricePerPerson: 100, totalPrice: 200, priceNote: rich('per person') }, { name: 'B', hotels: [stay('Hotel B')], pricePerPerson: 150, totalPrice: 300, priceNote: hostile }] });
  assert.equal(options.success, true, options.message);
  assert.deepEqual(options.data.options.map((o) => o.priceNote), [rich('per person'), '<p><strong>Bold</strong></p>']);

  const land = await create({ quotationType: 'Land Service', vehicles: [{ vehicleType: 'SUV', seats: 7, quantity: 1, acType: 'AC', rate: 18500, notes: rich('with driver') }], landService: { route: 'Delhi - Agra', priceNote: rich('GST extra') }, pricing: { grandTotal: 1, totalCostNote: 'ignored', notes: rich('trip notes') } });
  assert.equal(land.success, true, land.message);
  assert.equal(land.data.vehicles[0].notes, rich('with driver'));
  assert.equal(land.data.landService.priceNote, rich('GST extra'));
  assert.equal(land.data.pricing.grandTotal, 18500, 'a land service price is still its vehicle total');
  assert.equal(land.data.pricing.totalCostNote, 'Rs 18,500 total', 'and its price line is still worked out, not replaced');
  assert.equal(land.data.pricing.notes, rich('trip notes'), 'but its notes can be formatted');

  const visa = await create({ quotationType: 'Visa', visa: { country: 'UAE', applicants: 2, priceNote: rich('fees may change') }, visaFees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }], pricing: { grandTotal: 1 } });
  assert.equal(visa.success, true, visa.message);
  assert.equal(visa.data.visa.priceNote, rich('fees may change'));
  assert.equal(visa.data.pricing.grandTotal, 13000);
});

test('duplicating a quotation keeps all of that formatting', async () => {
  const made = (await create({ pricing: { totalCostNote: rich('price'), notes: rich('notes'), grandTotal: 5 }, endOfTourNote: rich('end') })).data;
  const copy = (await api(`/${made._id}/duplicate`, { method: 'POST', token: admin.token })).body.data;
  assert.deepEqual([copy.pricing.totalCostNote, copy.pricing.notes, copy.endOfTourNote], [rich('price'), rich('notes'), rich('end')]);
});
