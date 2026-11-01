import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// Land service quotations (vehicle only, with itinerary and pricing). Other quotation types are unchanged.

let app;
let admin;

const api = (path, opts = {}) => app.call(`/api/quotations${path}`, opts);
const base = (over = {}) => ({ clientName: 'Aarav Mehta', destination: 'DELHI - AGRA - JAIPUR', quotationType: 'Land Service', ...over });
const create = async (over) => (await api('', { method: 'POST', token: admin.token, json: base(over) })).body;
const suv = (over = {}) => ({ vehicleType: 'SUV (Innova Crysta)', seats: 7, quantity: 2, acType: 'AC', rate: 18500, notes: '', ...over });
const pricing = (over = {}) => ({ items: [], totalCostPerPerson: 123, grandTotal: 999, currency: 'Rs', notes: 'kept', ...over });

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
});
after(async () => {
  await app.close();
});

test('a land service quotation is saved with its vehicles, trip details, inclusions and itinerary', async () => {
  const body = await create({
    vehicles: [suv(), suv({ vehicleType: 'Tempo Traveller (12 seater)', seats: 12, quantity: 1, rate: 32000, acType: 'Non-AC' })],
    landService: { route: 'Delhi - Agra - Jaipur - Delhi', pickupPoint: 'IGI Airport', dropPoint: 'IGI Airport', kmPolicy: '250 km per day', priceNote: 'GST extra' },
    vehicleInclusions: ['Fuel', '<p onclick="x()"><strong>Driver allowance</strong></p><script>alert(1)</script>'],
    itinerary: [{ dayNumber: 'Day 01', title: 'Delhi to Agra', description: '<p>Pick-up and drive to Agra.</p>' }],
    pricing: pricing()
  });
  assert.equal(body.success, true, body.message);
  const d = body.data;
  assert.equal(d.quotationType, 'Land Service');
  assert.deepEqual(d.vehicles.map((v) => [v.vehicleType, v.seats, v.quantity, v.acType, v.rate]), [['SUV (Innova Crysta)', 7, 2, 'AC', 18500], ['Tempo Traveller (12 seater)', 12, 1, 'Non-AC', 32000]]);
  assert.equal(d.landService.route, 'Delhi - Agra - Jaipur - Delhi');
  assert.equal(d.landService.kmPolicy, '250 km per day');
  assert.deepEqual(d.vehicleInclusions, ['Fuel', '<p><strong>Driver allowance</strong></p>'], 'formatted lines are cleaned, plain lines kept');
  assert.equal(d.itinerary[0].title, 'Delhi to Agra');
});

test('the amount the lists and statistics read always equals the vehicle total (and the rest of the pricing is kept)', async () => {
  const body = await create({ vehicles: [suv(), suv({ vehicleType: 'Sedan', quantity: 1, rate: 9000.5 })], pricing: pricing() });
  assert.equal(body.success, true, body.message);
  assert.equal(body.data.pricing.grandTotal, 2 * 18500 + 9000.5, 'not the 999 the browser sent');
  assert.equal(body.data.pricing.totalCostPerPerson, 0);
  assert.equal(body.data.pricing.totalCostNote, 'Rs 46,000.5 total');
  assert.equal(body.data.pricing.notes, 'kept');
  const changed = await api(`/${body.data._id}`, { method: 'PUT', token: admin.token, json: { quotationType: 'Land Service', vehicles: [suv({ quantity: 3 })], pricing: pricing({ grandTotal: 1 }) } });
  assert.equal(changed.body.data.pricing.grandTotal, 55500);
  const stats = await api('/stats', { token: admin.token });
  assert.equal(stats.body.success, true);
});

test('problems are explained in plain language, name the vehicle, and nothing is saved', async () => {
  const before = (await api('', { token: admin.token })).body.count;
  const cases = [
    [{ vehicles: [suv({ vehicleType: '' })] }, /Please enter the vehicle type for vehicle 1/],
    [{ vehicles: [suv(), suv({ quantity: 0 })] }, /number of vehicles in line 2/],
    [{ vehicles: [suv({ rate: -5 })] }, /rate of vehicle 1 must be an amount/],
    [{ vehicles: [suv({ acType: 'Heated' })] }, /Please choose AC or Non-AC for vehicle 1/],
    [{ vehicles: 'car' }, /The vehicles must be a list/],
    [{ vehicles: [suv()], landService: { route: 'x'.repeat(300) } }, /route is too long/i],
    [{ vehicles: [suv()], vehicleInclusions: ['ok', 'x'.repeat(1500)] }, /The vehicle inclusions, item 2/]
  ];
  for (const [over, message] of cases) {
    const body = await create({ pricing: pricing(), ...over });
    assert.equal(body.success, false, JSON.stringify(over).slice(0, 70));
    assert.match(body.message, message);
  }
  assert.equal((await api('', { token: admin.token })).body.count, before);
});

test('an update without vehicles leaves them and the amount alone; sending them replaces them; a refused update changes nothing', async () => {
  const made = await create({ vehicles: [suv()], landService: { route: 'A - B' }, vehicleInclusions: ['Fuel'], pricing: pricing() });
  const id = made.data._id;
  const statusOnly = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { status: 'Sent' } });
  assert.equal(statusOnly.body.data.vehicles.length, 1);
  assert.equal(statusOnly.body.data.pricing.grandTotal, 37000);
  assert.equal(statusOnly.body.data.landService.route, 'A - B');
  assert.deepEqual(statusOnly.body.data.vehicleInclusions, ['Fuel']);

  const refused = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { quotationType: 'Land Service', vehicles: [suv({ rate: 'lots' })], pricing: pricing() } });
  assert.equal(refused.body.success, false);
  assert.equal((await api(`/${id}`, { token: admin.token })).body.data.vehicles[0].rate, 18500);
});

test('other quotation types are untouched: no vehicles, and their own pricing is never overwritten', async () => {
  const body = await create({ quotationType: 'Package', pricing: pricing({ grandTotal: 77777, totalCostPerPerson: 25000 }) });
  assert.equal(body.success, true, body.message);
  assert.deepEqual(body.data.vehicles, []);
  assert.equal(body.data.pricing.grandTotal, 77777);
  const hotel = await create({ quotationType: 'Only Hotel', vehicles: [suv()], pricing: pricing({ grandTotal: 5 }) });
  assert.equal(hotel.data.pricing.grandTotal, 5, 'vehicles on a non-land-service quotation do not touch its price');
});

test('duplicating a land service quotation keeps vehicles and trip details', async () => {
  const made = await create({ vehicles: [suv()], landService: { route: 'A - B', priceNote: 'GST extra' }, vehicleInclusions: ['Fuel'], pricing: pricing() });
  const copy = await api(`/${made.data._id}/duplicate`, { method: 'POST', token: admin.token });
  assert.equal(copy.body.success, true, copy.body.message);
  assert.equal(copy.body.data.quotationType, 'Land Service');
  assert.equal(copy.body.data.vehicles[0].vehicleType, 'SUV (Innova Crysta)');
  assert.equal(copy.body.data.landService.priceNote, 'GST extra');
  assert.deepEqual(copy.body.data.vehicleInclusions, ['Fuel']);
});

test('a quotation made before land service existed (no vehicle fields at all) reads back with empty ones', async () => {
  const body = await create({ quotationType: 'Package' });
  const read = await api(`/${body.data._id}`, { token: admin.token });
  assert.deepEqual(read.body.data.vehicles, []);
  assert.deepEqual(read.body.data.vehicleInclusions, []);
  assert.equal(read.body.data.landService.route, '');
});
