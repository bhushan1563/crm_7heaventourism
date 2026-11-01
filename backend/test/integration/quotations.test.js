import { startDbApp, fakeImage, photoForm, mediaPath } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The itinerary of a quotation: plain days from before still work, new days may carry formatted text and photos.

let app;
let admin;
let photoA;
let photoB;

const api = (path, opts = {}) => app.call(`/api/quotations${path}`, opts);
const base = (over = {}) => ({ clientName: 'Aarav Mehta', destination: 'Bali', ...over });
const create = async (over) => (await api('', { method: 'POST', token: admin.token, json: base(over) })).body;
const upload = async (w) => (await app.call(mediaPath('quotation'), { method: 'POST', token: admin.token, form: photoForm({ image: fakeImage.jpeg(w, 600, w) }) })).body.data;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  photoA = await upload(901);
  photoB = await upload(902);
});
after(async () => {
  await app.close();
});

test('a quotation with plain-text days (the way it has always been, and how the mobile app sends it) is saved untouched', async () => {
  const body = await create({ itinerary: [{ dayNumber: 'Day 01', title: 'Arrival & Welcome', description: 'Arrival.\nMeet & greet <TBC>.' }, { dayNumber: 'Day 02', title: '', description: '' }] });
  assert.equal(body.success, true, body.message);
  const [d1, d2] = body.data.itinerary;
  assert.equal(d1.description, 'Arrival.\nMeet & greet <TBC>.');
  assert.deepEqual(d1.photos, []);
  assert.equal(d2.dayNumber, 'Day 02');
});

test('a day can carry formatted text and photos; the text is cleaned and the photo sizes come from the server', async () => {
  const body = await create({
    itinerary: [{ dayNumber: 'Day 01', title: 'Ubud', description: '<p onclick="x()">Temples <b>and</b> rice</p><script>alert(1)</script>', stay: 'Ubud', meals: 'Dinner', photos: [{ token: photoA.token, caption: 'Pool', width: 1, height: 1 }, { token: photoB.token }] }]
  });
  assert.equal(body.success, true, body.message);
  const day = body.data.itinerary[0];
  assert.equal(day.description, '<p>Temples <strong>and</strong> rice</p>');
  assert.deepEqual(day.photos.map((p) => [p.token, p.width, p.height, p.caption]), [[photoA.token, photoA.width, photoA.height, 'Pool'], [photoB.token, photoB.width, photoB.height, '']]);
  const read = await api(`/${body.data._id}`, { token: admin.token });
  assert.equal(read.body.data.itinerary[0].photos.length, 2, 'and it comes back when the quotation is opened');
});

test('a photo that does not exist is refused with a clear message and nothing is saved', async () => {
  const before = (await api('', { token: admin.token })).body.count;
  const body = await create({ itinerary: [{ title: 'Day', photos: [{ token: 'Z'.repeat(24) }] }] });
  assert.equal(body.success, false);
  assert.match(body.message, /One of the photos is no longer available/);
  assert.equal((await api('', { token: admin.token })).body.count, before);
});

test('problems with the days are explained and name the day', async () => {
  const tooLong = await create({ itinerary: [{ title: 'ok' }, { title: 'x'.repeat(200) }] });
  assert.equal(tooLong.success, false);
  assert.match(tooLong.message, /title of Day 2 is too long/);
  const notList = await create({ itinerary: 'oops' });
  assert.match(notList.message, /must be a list/);
});

test('updating without sending the itinerary leaves the days and photos alone; sending it replaces them', async () => {
  const made = await create({ itinerary: [{ title: 'Ubud', description: '<p>Keep me</p>', photos: [{ token: photoA.token }] }] });
  const id = made.data._id;
  const statusOnly = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { status: 'Sent' } });
  assert.equal(statusOnly.body.success, true, statusOnly.body.message);
  assert.equal(statusOnly.body.data.status, 'Sent');
  assert.equal(statusOnly.body.data.itinerary[0].description, '<p>Keep me</p>');
  assert.equal(statusOnly.body.data.itinerary[0].photos.length, 1);

  const replaced = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { itinerary: [{ title: 'New', description: 'plain' }] } });
  assert.equal(replaced.body.success, true, replaced.body.message);
  assert.equal(replaced.body.data.itinerary.length, 1);
  assert.deepEqual(replaced.body.data.itinerary[0].photos, []);

  const bad = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { itinerary: [{ photos: [{ token: 'Y'.repeat(24) }] }] } });
  assert.equal(bad.body.success, false);
  const stillThere = await api(`/${id}`, { token: admin.token });
  assert.equal(stillThere.body.data.itinerary[0].title, 'New', 'a refused update changes nothing');
});

test('duplicating a quotation keeps its day photos', async () => {
  const made = await create({ itinerary: [{ title: 'Ubud', photos: [{ token: photoB.token }] }] });
  const copy = await api(`/${made.data._id}/duplicate`, { method: 'POST', token: admin.token });
  assert.equal(copy.body.success, true, copy.body.message);
  assert.equal(copy.body.data.itinerary[0].photos[0].token, photoB.token);
});

test('photos used only on a quotation are never treated as unused by the storage clean-up', async () => {
  const { findOrphans } = await import('../../src/services/mediaCleanup.js');
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const { default: Media } = await import('../../src/models/Media.js');
  const used = await upload(911);
  const unused = await upload(912);
  await create({ itinerary: [{ title: 'Only here', photos: [{ token: used.token }] }] });
  const longAgo = new Date(Date.now() - 3 * 86400000);
  await Media.collection.updateMany({ token: { $in: [used.token, unused.token] } }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });
  const orphans = (await findOrphans(await getMediaSources())).map((m) => m.token);
  assert.ok(!orphans.includes(used.token), 'a photo on a day of a quotation is in use');
  assert.ok(orphans.includes(unused.token));
});

test('a photo that was removed from the quotation (not saved with it) can be cleaned up later', async () => {
  const { findOrphans } = await import('../../src/services/mediaCleanup.js');
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const { default: Media } = await import('../../src/models/Media.js');
  const photo = await upload(921);
  const made = await create({ itinerary: [{ title: 'Temporary', photos: [{ token: photo.token }] }] });
  await api(`/${made.data._id}`, { method: 'PUT', token: admin.token, json: { itinerary: [{ title: 'Temporary' }] } });
  const longAgo = new Date(Date.now() - 3 * 86400000);
  await Media.collection.updateMany({ token: photo.token }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });
  assert.ok((await findOrphans(await getMediaSources())).some((m) => m.token === photo.token));
});

// ---------------------------------------------------------------- hotel stays taken from the hotel list

const stay = (over = {}) => ({ nights: '2 Nights', city: 'Ubud', hotelName: 'The Ubud Retreat', starRating: '5 star', roomCategory: 'Deluxe Room', mealPlan: 'CP (Breakfast Only)', noOfRooms: '1 Room', ...over });
const withStays = (hotels, over = {}) => ({ packageDetails: { hotels, roomInfo: '1 Room', inclusions: ['Breakfast'] }, ...over });

test('a hotel quotation keeps the stay with its hotel, photos, amenities and times; photo sizes come from the server', async () => {
  const hotelId = '0123456789abcdef01234567';
  const body = await create(withStays([stay({ hotelId, photos: [{ token: photoA.token, caption: 'Pool', width: 1, height: 1 }, { token: photoB.token }], amenities: ['Pool', 'Spa'], roomOptions: ['Deluxe Room', 'Suite'], checkInTime: '14:00', checkOutTime: '11:00' })], { quotationType: 'Only Hotel' }));
  assert.equal(body.success, true, body.message);
  const s = body.data.packageDetails.hotels[0];
  assert.equal(s.hotelId, hotelId);
  assert.deepEqual(s.photos.map((p) => [p.token, p.width, p.height, p.caption]), [[photoA.token, photoA.width, photoA.height, 'Pool'], [photoB.token, photoB.width, photoB.height, '']]);
  assert.deepEqual([s.amenities, s.roomOptions, s.checkInTime, s.checkOutTime], [['Pool', 'Spa'], ['Deluxe Room', 'Suite'], '14:00', '11:00']);
  assert.equal(s.hotelName, 'The Ubud Retreat');
  assert.equal(body.data.packageDetails.roomInfo, '1 Room', 'the rest of the package details is untouched');
  const read = await api(`/${body.data._id}`, { token: admin.token });
  assert.equal(read.body.data.packageDetails.hotels[0].photos.length, 2);
});

test('stays typed by hand (the way the app and old quotations have them) are saved exactly as before', async () => {
  const body = await create(withStays([stay({ hotelName: 'Hotel Rivatas', city: 'Varanasi' })]));
  assert.equal(body.success, true, body.message);
  const s = body.data.packageDetails.hotels[0];
  assert.equal(s.hotelName, 'Hotel Rivatas');
  assert.deepEqual([s.hotelId, s.photos, s.amenities], ['', [], []]);
});

test('a stay with a photo that does not exist, or a wrong hotel reference, is refused with a clear message and nothing is saved', async () => {
  const before = (await api('', { token: admin.token })).body.count;
  const missing = await create(withStays([stay({ photos: [{ token: 'Z'.repeat(24) }] })]));
  assert.equal(missing.success, false);
  assert.match(missing.message, /One of the photos is no longer available/);
  const wrongId = await create(withStays([stay({ hotelId: 'nope' })]));
  assert.match(wrongId.message, /hotel chosen for stay 1 is not valid/);
  const wrongTime = await create(withStays([stay({ checkInTime: '25:00' })]));
  assert.match(wrongTime.message, /check-in time of hotel stay 1/);
  assert.equal((await api('', { token: admin.token })).body.count, before);
});

test('updating a quotation without the stays leaves them alone; sending them replaces them; a refused update changes nothing', async () => {
  const made = await create(withStays([stay({ photos: [{ token: photoA.token }], amenities: ['Pool'] })]));
  const id = made.data._id;
  const statusOnly = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { status: 'Sent' } });
  assert.equal(statusOnly.body.data.packageDetails.hotels[0].photos.length, 1);
  assert.deepEqual(statusOnly.body.data.packageDetails.hotels[0].amenities, ['Pool']);

  const replaced = await api(`/${id}`, { method: 'PUT', token: admin.token, json: withStays([stay({ hotelName: 'Another' })]) });
  assert.equal(replaced.body.success, true, replaced.body.message);
  assert.deepEqual(replaced.body.data.packageDetails.hotels.map((h) => [h.hotelName, h.photos.length]), [['Another', 0]]);

  const refused = await api(`/${id}`, { method: 'PUT', token: admin.token, json: withStays([stay({ photos: [{ token: 'Y'.repeat(24) }] })]) });
  assert.equal(refused.body.success, false);
  assert.equal((await api(`/${id}`, { token: admin.token })).body.data.packageDetails.hotels[0].hotelName, 'Another');
});

test('both the itinerary days and the hotel stays are checked together, and either one can refuse the save', async () => {
  const both = await create({ itinerary: [{ title: 'Day', photos: [{ token: photoA.token }] }], ...withStays([stay({ photos: [{ token: photoB.token }] })]) });
  assert.equal(both.success, true, both.message);
  assert.equal(both.data.itinerary[0].photos.length, 1);
  assert.equal(both.data.packageDetails.hotels[0].photos.length, 1);
  const badStay = await create({ itinerary: [{ title: 'Day' }], ...withStays([stay({ hotelId: 'bad' })]) });
  assert.equal(badStay.success, false);
  const badDay = await create({ itinerary: [{ title: 'x'.repeat(200) }], ...withStays([stay()]) });
  assert.match(badDay.message, /title of Day 1 is too long/);
});

test('photos used only on a hotel stay of a quotation are never treated as unused by the storage clean-up', async () => {
  const { findOrphans } = await import('../../src/services/mediaCleanup.js');
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const { default: Media } = await import('../../src/models/Media.js');
  const used = await upload(931);
  const unused = await upload(932);
  await create(withStays([stay({ photos: [{ token: used.token }] })]));
  const longAgo = new Date(Date.now() - 3 * 86400000);
  await Media.collection.updateMany({ token: { $in: [used.token, unused.token] } }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });
  const orphans = (await findOrphans(await getMediaSources())).map((m) => m.token);
  assert.ok(!orphans.includes(used.token), 'a photo on a hotel stay is in use');
  assert.ok(orphans.includes(unused.token));
});
