import { startDbApp, fakeImage, photoForm, mediaPath } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// Several hotel options with their own prices on one quotation. Quotations without options are unchanged.

let app;
let admin;
let sales;
let photoA;

const api = (path, opts = {}) => app.call(`/api/quotations${path}`, opts);
const base = (over = {}) => ({ clientName: 'Aarav Mehta', destination: 'Varanasi', paxDetails: '2 Adults', ...over });
const create = async (over, token = admin.token) => (await api('', { method: 'POST', token, json: base(over) })).body;
const stay = (over = {}) => ({ hotelName: 'Hotel Rivatas', city: 'Varanasi', nights: '2 Nights', starRating: '4 star', roomCategory: 'Deluxe Room', mealPlan: 'CP (Breakfast Only)', noOfRooms: '1 Room', ...over });
const option = (over = {}) => ({ name: 'Option A', hotels: [stay()], pricePerPerson: 25000, totalPrice: 50000, priceNote: 'Per person on twin sharing', ...over });
const upload = async (w) => (await app.call(mediaPath('quotation'), { method: 'POST', token: admin.token, form: photoForm({ image: fakeImage.jpeg(w, 600, w) }) })).body.data;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  sales = await app.makeUser('Sales');
  photoA = await upload(1101);
});
after(async () => {
  await app.close();
});

test('a quotation with no options is exactly as before (no options, nothing added to its other fields)', async () => {
  const body = await create({ packageDetails: { hotels: [stay()], roomInfo: '1 Room' }, pricing: { totalCostPerPerson: 20000, grandTotal: 40000 } });
  assert.equal(body.success, true, body.message);
  assert.deepEqual(body.data.options, []);
  assert.equal(body.data.packageDetails.hotels.length, 1);
  assert.equal(body.data.pricing.grandTotal, 40000);
});

test('options are saved with their own hotels, photos and prices, in order, with one recommended', async () => {
  const body = await create({
    options: [
      option({ name: 'Option A: 4-star', recommended: false }),
      option({ name: 'Option B: 5-star', recommended: true, pricePerPerson: 42000, totalPrice: 84000, hotels: [stay({ hotelName: 'Taj Nadesar', starRating: '5 star', photos: [{ token: photoA.token, caption: 'Pool', width: 1, height: 1 }] })] })
    ]
  });
  assert.equal(body.success, true, body.message);
  const [a, b] = body.data.options;
  assert.deepEqual([a.name, a.pricePerPerson, a.totalPrice, a.recommended], ['Option A: 4-star', 25000, 50000, false]);
  assert.deepEqual([b.name, b.pricePerPerson, b.recommended], ['Option B: 5-star', 42000, true]);
  assert.equal(b.hotels[0].hotelName, 'Taj Nadesar');
  assert.deepEqual([b.hotels[0].photos[0].token, b.hotels[0].photos[0].width, b.hotels[0].photos[0].height], [photoA.token, photoA.width, photoA.height], 'photo sizes come from the server');
  const read = await api(`/${body.data._id}`, { token: admin.token });
  assert.equal(read.body.data.options.length, 2);
});

test('problems are explained in plain language, name the option, and nothing is saved', async () => {
  const before = (await api('', { token: admin.token })).body.count;
  const cases = [
    [{ options: [option({ pricePerPerson: -1 })] }, /price per person of option 1 must be an amount/],
    [{ options: [option(), option({ recommended: true }), option({ recommended: true })] }, /Only one option can be marked as recommended/],
    [{ options: [option({ hotels: [stay({ photos: [{ token: 'Z'.repeat(24) }] })] })] }, /One of the photos is no longer available/],
    [{ options: [option({ hotels: [stay({ hotelId: 'nope' })] })] }, /^Option 1: The hotel chosen for stay 1 is not valid/],
    [{ options: 'oops' }, /The options must be a list/],
    [{ options: Array.from({ length: 7 }, () => option()) }, /at most 6 options/]
  ];
  for (const [over, message] of cases) {
    const body = await create(over);
    assert.equal(body.success, false, JSON.stringify(over).slice(0, 80));
    assert.match(body.message, message);
  }
  assert.equal((await api('', { token: admin.token })).body.count, before);
});

test('updating without options leaves them alone; sending them replaces them; sending none removes them; a refused update changes nothing', async () => {
  const made = await create({ options: [option(), option({ name: 'Option B' })] });
  const id = made.data._id;
  const statusOnly = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { status: 'Sent' } });
  assert.equal(statusOnly.body.data.options.length, 2);

  const replaced = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { options: [option({ name: 'Only one now', pricePerPerson: 31000, totalPrice: 62000 })] } });
  assert.equal(replaced.body.success, true, replaced.body.message);
  assert.deepEqual(replaced.body.data.options.map((o) => [o.name, o.pricePerPerson]), [['Only one now', 31000]]);

  const refused = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { options: [option({ totalPrice: 'lots' })] } });
  assert.equal(refused.body.success, false);
  assert.equal((await api(`/${id}`, { token: admin.token })).body.data.options[0].name, 'Only one now');

  const cleared = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { options: [] } });
  assert.deepEqual(cleared.body.data.options, [], 'back to a single offer');
});

test('duplicating a quotation keeps its options', async () => {
  const made = await create({ options: [option(), option({ name: 'Option B', recommended: true })] });
  const copy = await api(`/${made.data._id}/duplicate`, { method: 'POST', token: admin.token });
  assert.equal(copy.body.success, true, copy.body.message);
  assert.deepEqual(copy.body.data.options.map((o) => [o.name, o.recommended]), [['Option A', false], ['Option B', true]]);
});

test('options, itinerary days, hotel stays and lists are all cleaned in the same save; Sales needs quotation rights to save', async () => {
  const body = await create({ itinerary: [{ title: 'Day', description: '<p>x<script>1</script></p>' }], packageDetails: { hotels: [stay()] }, options: [option()], exclusions: ['<p><b>Airfare</b></p>'] });
  assert.equal(body.success, true, body.message);
  assert.equal(body.data.itinerary[0].description, '<p>x</p>');
  assert.equal(body.data.options.length, 1);
  assert.deepEqual(body.data.exclusions, ['<p><strong>Airfare</strong></p>']);
  const denied = await create({ options: [option()] }, sales.token);
  assert.equal(denied.success, false);
  assert.match(denied.message, /Permission Denied/);
});

test('photos used only inside an option are never treated as unused by the storage clean-up', async () => {
  const { findOrphans } = await import('../../src/services/mediaCleanup.js');
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const { default: Media } = await import('../../src/models/Media.js');
  const used = await upload(1111);
  const unused = await upload(1112);
  await create({ options: [option({ hotels: [stay({ photos: [{ token: used.token }] })] })] });
  const longAgo = new Date(Date.now() - 3 * 86400000);
  await Media.collection.updateMany({ token: { $in: [used.token, unused.token] } }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });
  const orphans = (await findOrphans(await getMediaSources())).map((m) => m.token);
  assert.ok(!orphans.includes(used.token), 'a photo on a hotel inside an option is in use');
  assert.ok(orphans.includes(unused.token));
});

test('a hotel inside an option keeps its check-in and check-out dates, rooms and address when saved and read again, for a destination typed as the city', async () => {
  const body = await create({
    quotationType: 'Only Hotel',
    destination: 'UDAIPUR',
    options: [
      option({ name: '3 Star', hotels: [stay({ hotelName: 'Hotel Sunrise', address: '12 Lake Road, Udaipur', noOfRooms: '2 Rooms', checkInDate: '2026-03-07', checkOutDate: '2026-03-10', nights: '3 Nights' }), stay({ hotelName: 'Hotel Moonlight', checkInDate: '2026-03-10', checkOutDate: '2026-03-12', nights: '2 Nights' })] }),
      option({ name: '4 Star', hotels: [stay({ hotelName: 'Hotel Orchid', checkInDate: '2026-03-07T00:00:00.000Z', checkOutDate: '2026-03-12T00:00:00.000Z', nights: '5 Nights' })] })
    ]
  });
  assert.equal(body.success, true, body.message);
  const read = (await api(`/${body.data._id}`, { token: admin.token })).body.data;
  assert.equal(read.destination, 'UDAIPUR');
  const [first, second] = read.options[0].hotels;
  assert.equal(first.address, '12 Lake Road, Udaipur');
  assert.equal(first.noOfRooms, '2 Rooms');
  assert.equal(String(first.checkInDate).slice(0, 10), '2026-03-07');
  assert.equal(String(first.checkOutDate).slice(0, 10), '2026-03-10');
  assert.equal(first.nights, '3 Nights');
  assert.equal(String(second.checkInDate).slice(0, 10), '2026-03-10', 'each hotel keeps its own dates');
  assert.equal(String(read.options[1].hotels[0].checkOutDate).slice(0, 10), '2026-03-12');
});
