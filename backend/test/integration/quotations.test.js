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
