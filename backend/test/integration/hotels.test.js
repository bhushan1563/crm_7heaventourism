import { startDbApp, fakeImage, photoForm, mediaPath } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

let app;
let admin;
let sales;
let ops;
let viewer;
let photoA;
let photoB;

const api = (path, opts = {}) => app.call(`/api/hotels${path}`, opts);
const make = (over = {}) => ({ name: 'The Ubud Retreat', city: 'Ubud', country: 'Indonesia', starRating: '5 star', ...over });
const create = async (token, over) => (await api('', { method: 'POST', token, json: make(over) })).body;
const upload = async (token, w) => (await app.call(mediaPath('hotel'), { method: 'POST', token, form: photoForm({ image: fakeImage.jpeg(w, 600, w) }) })).body.data;

before(async () => {
  app = await startDbApp();
  [admin, sales, ops, viewer] = await Promise.all(['Admin', 'Sales', 'Ops', 'Viewer'].map((r) => app.makeUser(r)));
  photoA = await upload(sales.token, 1001);
  photoB = await upload(sales.token, 1002);
});
after(async () => {
  await app.close();
});

test('create: a hotel is saved with its owner, tidy values and photo sizes taken from the server', async () => {
  const body = await create(sales.token, {
    name: '  The  Grand Palace ', city: 'Jaipur', starRating: 'Heritage / Palace', phone: '+91 141 123 4567', email: 'Stay@Palace.com', website: 'www.grandpalace.in',
    description: '<p onclick="x()">Royal <b>stay</b></p><script>alert(1)</script>', amenities: ['Pool', 'pool', 'Spa'], roomTypes: [{ name: 'Palace Suite', details: 'King bed' }],
    mealPlans: ['MAP (Breakfast & Dinner)'], tags: ['Heritage'], photos: [{ token: photoA.token, caption: 'Front', width: 1, height: 1 }]
  });
  assert.equal(body.success, true, body.message);
  const d = body.data;
  assert.equal(d.name, 'The Grand Palace');
  assert.equal(d.email, 'stay@palace.com');
  assert.equal(d.website, 'https://www.grandpalace.in');
  assert.equal(d.description, '<p>Royal <strong>stay</strong></p>');
  assert.deepEqual(d.amenities, ['Pool', 'Spa']);
  assert.deepEqual(d.tags, ['heritage']);
  assert.equal(d.photos[0].width, photoA.width, 'the size comes from the stored photo, not from the request');
  assert.equal(d.createdBy, String(sales.user._id));
  assert.equal(d.status, 'Active');
  assert.equal(d.__v, undefined);
  assert.equal(d.deleted, undefined);
  assert.equal(d.nameKey, undefined, 'internal fields are not sent to the browser');
});

test('create: every problem is explained in plain language', async () => {
  const cases = [
    [{ name: '' }, /Please enter the name of the hotel/],
    [{ city: '  ' }, /Please enter the city/],
    [{ starRating: '9 star' }, /Please choose the rating from the list/],
    [{ email: 'nope' }, /email address does not look right/],
    [{ website: 'javascript:alert(1)' }, /website address does not look right/],
    [{ phone: 'call me' }, /phone number may only contain digits/],
    [{ checkInTime: '25:61' }, /check-in time must be a time like 14:00/],
    [{ photos: [{ token: 'AAAAAAAAAAAAAAAAAAAAAAAA' }] }, /no longer available/],
    [{ roomTypes: [{ name: 'A' }, { name: 'a' }] }, /listed twice/],
    [{ name: { $ne: 1 } }, /must be text/]
  ];
  for (const [over, message] of cases) {
    const body = await create(sales.token, { name: `Case ${JSON.stringify(over).length}`, ...over });
    assert.equal(body.success, false, JSON.stringify(over));
    assert.match(body.message, message);
  }
});

test('the same hotel cannot be added twice, however it is typed; the message says where it is', async () => {
  assert.equal((await create(sales.token, { name: 'Ocean Pearl', city: 'Goa' })).success, true);
  for (const [name, city] of [['Ocean Pearl', 'Goa'], ['  ocean   PEARL ', ' goa '], ['OCEAN PEARL', 'GOA']]) {
    const again = await create(ops.token, { name, city });
    assert.equal(again.success, false);
    assert.match(again.message, /"Ocean Pearl" in Goa is already in the hotel list\. Search for it/);
  }
  assert.equal((await create(sales.token, { name: 'Ocean Pearl', city: 'Mumbai' })).success, true, 'the same name in another city is a different hotel');
});

test('an archived hotel still counts, and the message tells the user to restore it', async () => {
  const made = await create(sales.token, { name: 'Sleepy Lodge', city: 'Manali' });
  await api(`/${made.data._id}`, { method: 'PUT', token: sales.token, json: { status: 'Archived' } });
  const again = await create(sales.token, { name: 'Sleepy Lodge', city: 'Manali' });
  assert.equal(again.success, false);
  assert.match(again.message, /archived\. Open the Archived tab and restore it/);
});

test('two people adding the same hotel at the same moment: exactly one is saved, the other is told plainly', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => create([sales, ops, admin][i % 3].token, { name: 'Race Resort', city: 'Kochi' })));
  assert.equal(results.filter((r) => r.success).length, 1);
  for (const r of results.filter((x) => !x.success)) assert.match(r.message, /already in the hotel list|just added by someone else/);
  const list = await api('?search=Race%20Resort', { token: admin.token });
  assert.equal(list.body.total, 1);
});

test('rights: everyone can look, Sales and Ops can add and edit, a Viewer cannot, only an Admin can delete', async () => {
  const made = await create(sales.token, { name: 'Rights Hotel', city: 'Pune' });
  const id = made.data._id;
  assert.equal((await api('', { token: viewer.token })).body.success, true, 'a Viewer can see the list');
  assert.equal((await api(`/${id}`, { token: viewer.token })).body.success, true);
  const viewerAdd = await create(viewer.token, { name: 'Viewer Hotel', city: 'Pune' });
  assert.equal(viewerAdd.success, false);
  assert.match(viewerAdd.message, /Permission Denied/);
  assert.equal((await api(`/${id}`, { method: 'PUT', token: viewer.token, json: { notes: 'x' } })).body.success, false);
  assert.equal((await api(`/${id}`, { method: 'PUT', token: ops.token, json: { phone: '+91 20 1234 5678' } })).body.success, true, 'Ops may edit a hotel Sales added');
  const salesDelete = await api(`/${id}`, { method: 'DELETE', token: sales.token });
  assert.equal(salesDelete.body.success, false);
  assert.match(salesDelete.body.message, /Permission Denied/);
  assert.equal((await app.call('/api/hotels')).status, 401, 'no session, no access');
});

test('list: search finds by name, city, area, tag and amenity; filters and sorting work; pages are cut', async () => {
  await create(sales.token, { name: 'Alpha Beach Resort', city: 'Goa', area: 'Calangute', tags: ['beach'], amenities: ['Spa'], starRating: '5 star' });
  await create(sales.token, { name: 'Bravo Town Inn', city: 'Delhi', starRating: '3 star' });
  await create(sales.token, { name: 'Charlie Palace', city: 'Delhi', starRating: 'Heritage / Palace', amenities: ['Rooftop bar'] });
  const names = async (qs) => (await api(qs, { token: admin.token })).body.data.map((h) => h.name);

  assert.ok((await names('?search=alpha')).includes('Alpha Beach Resort'));
  assert.ok((await names('?search=calangute')).includes('Alpha Beach Resort'), 'by area');
  assert.ok((await names('?search=beach')).includes('Alpha Beach Resort'), 'by tag');
  assert.deepEqual(await names('?search=rooftop'), ['Charlie Palace'], 'by amenity');
  assert.deepEqual((await names('?city=delhi&sort=name')), ['Bravo Town Inn', 'Charlie Palace'], 'city filter ignores case');
  assert.deepEqual(await names('?city=Delhi&star=Heritage%20%2F%20Palace'), ['Charlie Palace']);
  assert.deepEqual(await names('?search=.*'), [], 'search text is not a pattern');
  assert.deepEqual(await names('?search=zzzznothing'), []);

  const sorted = await names('?sort=name&limit=50');
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  const page1 = (await api('?sort=name&limit=3&page=1', { token: admin.token })).body;
  const page2 = (await api('?sort=name&limit=3&page=2', { token: admin.token })).body;
  assert.equal(page1.data.length, 3);
  assert.ok(page1.pages >= 2 && page1.total > 3);
  assert.ok(!page2.data.some((h) => page1.data.some((x) => x._id === h._id)), 'pages do not overlap');
});

test('list: rows are lean (no descriptions, policies or photo lists) and carry the cover, counts and status', async () => {
  await create(sales.token, { name: 'Lean Lodge', city: 'Shimla', description: '<p>long text</p>', cancellationPolicy: 'policy', notes: 'internal', photos: [{ token: photoA.token }, { token: photoB.token }], roomTypes: [{ name: 'Std' }, { name: 'Dlx' }] });
  const row = (await api('?search=Lean%20Lodge', { token: admin.token })).body.data[0];
  assert.equal(row.photoCount, 2);
  assert.equal(row.roomTypeCount, 2);
  assert.equal(row.cover.token, photoA.token);
  for (const heavy of ['description', 'cancellationPolicy', 'notes', 'photos', 'roomTypes', 'nameKey']) assert.equal(row[heavy], undefined, `${heavy} must not be in the list`);
});

test('list: Active is the default, Archived and all can be asked for; archiving never destroys anything', async () => {
  const made = await create(sales.token, { name: 'Archive Me', city: 'Agra' });
  const id = made.data._id;
  const total = async (status) => (await api(`?search=Archive%20Me${status ? `&status=${status}` : ''}`, { token: admin.token })).body.total;
  assert.equal(await total(), 1);
  const archived = await api(`/${id}`, { method: 'PUT', token: sales.token, json: { status: 'Archived' } });
  assert.equal(archived.body.data.status, 'Archived');
  assert.deepEqual([await total(), await total('Archived'), await total('all')], [0, 1, 1]);
  assert.equal((await api(`/${id}`, { token: admin.token })).body.data.name, 'Archive Me', 'it can still be opened');
  assert.equal((await api(`/${id}`, { method: 'PUT', token: sales.token, json: { status: 'Active' } })).body.data.status, 'Active');
});

test('cities: the cities of active hotels with counts, ignoring case', async () => {
  const cities = (await api('/cities', { token: admin.token })).body.data;
  const delhi = cities.find((c) => c.city === 'Delhi');
  assert.ok(delhi && delhi.count >= 2);
  assert.deepEqual(cities.map((c) => c.city), [...cities.map((c) => c.city)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  assert.ok(!cities.some((c) => c.city === 'Manali'), 'a city with only archived hotels is not offered');
});

test('update: partial changes, audit trail follows the editor, name changes are checked for duplicates', async () => {
  const made = await create(sales.token, { name: 'Edit Me', city: 'Surat', phone: '+91 261 000 0000' });
  const id = made.data._id;
  const r = await api(`/${id}`, { method: 'PUT', token: ops.token, json: { country: 'India', amenities: ['Gym'] } });
  assert.equal(r.body.success, true, r.body.message);
  assert.equal(r.body.data.country, 'India');
  assert.equal(r.body.data.phone, '+91 261 000 0000', 'fields that were not sent are untouched');
  assert.equal(r.body.data.createdBy, String(sales.user._id));
  assert.equal(r.body.data.updatedBy, String(ops.user._id));

  await create(sales.token, { name: 'Taken Name', city: 'Surat' });
  const clash = await api(`/${id}`, { method: 'PUT', token: sales.token, json: { name: 'taken  NAME' } });
  assert.equal(clash.body.success, false);
  assert.match(clash.body.message, /"Taken Name" in Surat is already in the hotel list/);
  const rename = await api(`/${id}`, { method: 'PUT', token: sales.token, json: { name: 'Edit Me Too' } });
  assert.equal(rename.body.success, true, rename.body.message);
  const sameAgain = await api(`/${id}`, { method: 'PUT', token: sales.token, json: { name: 'EDIT ME TOO' } });
  assert.equal(sameAgain.body.success, true, 'changing only the capitals of its own name is fine');
  assert.equal((await create(sales.token, { name: 'Edit Me', city: 'Surat' })).success, true, 'the old name is free again after a rename');
});

test('update: a second editor who saves with an old version is told, and nothing is overwritten', async () => {
  const made = await create(sales.token, { name: 'Conflict Inn', city: 'Nagpur' });
  const id = made.data._id;
  const seen = made.data.updatedAt;
  const first = await api(`/${id}`, { method: 'PUT', token: sales.token, json: { notes: 'first', updatedAt: seen } });
  assert.equal(first.body.success, true, first.body.message);
  const second = await api(`/${id}`, { method: 'PUT', token: ops.token, json: { notes: 'second', updatedAt: seen } });
  assert.equal(second.body.success, false);
  assert.match(second.body.message, /changed by .* while you were editing it\. Please reload/);
  assert.equal((await api(`/${id}`, { token: admin.token })).body.data.notes, 'first');
  const bad = await api(`/${id}`, { method: 'PUT', token: ops.token, json: { notes: 'x', updatedAt: 'garbage' } });
  assert.equal(bad.body.success, false);
});

test('update: photos must exist, and a refused update changes nothing', async () => {
  const made = await create(sales.token, { name: 'Photo Inn', city: 'Kota', photos: [{ token: photoA.token }] });
  const id = made.data._id;
  const bad = await api(`/${id}`, { method: 'PUT', token: sales.token, json: { phone: '+91 744 111 1111', photos: [{ token: 'Z'.repeat(24) }] } });
  assert.equal(bad.body.success, false);
  assert.match(bad.body.message, /no longer available/);
  const after = (await api(`/${id}`, { token: admin.token })).body.data;
  assert.equal(after.phone, '');
  assert.equal(after.photos.length, 1);
});

test('delete: only for those with the right; the hotel disappears everywhere but is kept, and its name can be used again', async () => {
  const made = await create(sales.token, { name: 'Gone Hotel', city: 'Jodhpur' });
  const id = made.data._id;
  const done = await api(`/${id}`, { method: 'DELETE', token: admin.token });
  assert.equal(done.body.success, true, done.body.message);
  assert.equal((await api(`/${id}`, { token: admin.token })).body.success, false);
  assert.equal((await api('?search=Gone%20Hotel&status=all', { token: admin.token })).body.total, 0);
  const { default: Hotel } = await import('../../src/models/Hotel.js');
  assert.equal(await Hotel.countDocuments({ _id: id, deleted: true }), 1, 'still in the database');
  assert.equal((await create(sales.token, { name: 'Gone Hotel', city: 'Jodhpur' })).success, true);
  assert.match((await api(`/${id}`, { method: 'DELETE', token: admin.token })).body.message, /not found/i);
});

test('bad ids and hostile query strings never cause a server error', async () => {
  for (const path of ['/not-an-id', '/000000000000000000000000', '/%00', '?page=-5&limit=abc', '?limit=99999999', '?sort[$ne]=1', '?search[$ne]=1', '?city[$gt]=', '?star=<script>']) {
    const r = await api(path, { token: admin.token });
    assert.ok(r.status < 500, `${path} -> ${r.status}`);
    assert.equal(typeof r.body.success, 'boolean');
  }
  assert.ok((await api('?limit=99999999', { token: admin.token })).body.limit <= 50);
});

test('photos used only by a hotel are never treated as unused by the storage clean-up', async () => {
  const { findOrphans } = await import('../../src/services/mediaCleanup.js');
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const { default: Media } = await import('../../src/models/Media.js');
  const used = await upload(sales.token, 1011);
  const unused = await upload(sales.token, 1012);
  await create(sales.token, { name: 'Photo Keeper', city: 'Udaipur', photos: [{ token: used.token }] });
  const longAgo = new Date(Date.now() - 3 * 86400000);
  await Media.collection.updateMany({ token: { $in: [used.token, unused.token] } }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });
  const orphans = (await findOrphans(await getMediaSources())).map((m) => m.token);
  assert.ok(!orphans.includes(used.token), 'a photo in a hotel gallery is in use');
  assert.ok(orphans.includes(unused.token));
});

test('property: hostile payloads never cause a server error, and nothing dangerous is stored', async () => {
  const bit = fc.oneof(
    fc.string({ maxLength: 30 }),
    fc.constantFrom('<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '{"$ne":1}', '../../etc/passwd', '\u0000', 'x'.repeat(9000), 'javascript:alert(1)'),
    fc.integer(),
    fc.constant(null),
    fc.array(fc.string({ maxLength: 8 }), { maxLength: 3 })
  );
  const body = fc.record({ name: bit, city: bit, starRating: bit, description: bit, phone: bit, email: bit, website: bit, amenities: bit, roomTypes: fc.oneof(bit, fc.array(fc.record({ name: bit, details: bit }), { maxLength: 3 })), tags: bit, photos: bit, mealPlans: bit }, { requiredKeys: [] });
  await fc.assert(
    fc.asyncProperty(body, async (json) => {
      const r = await api('', { method: 'POST', token: sales.token, json });
      assert.ok(r.status < 500, `status ${r.status}`);
      assert.equal(typeof r.body.success, 'boolean');
      if (r.body.success) {
        if (/^\s*<(?:p|ul|ol)[\s>/]/i.test(r.body.data.description)) assert.doesNotMatch(r.body.data.description, /<script|<img|\sonerror=/i);
        if (r.body.data.website) assert.match(r.body.data.website, /^https?:\/\//);
      } else {
        assert.equal(typeof r.body.message, 'string');
      }
    }),
    { numRuns: 60 }
  );
});
