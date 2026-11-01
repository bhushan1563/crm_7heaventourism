import { startDbApp, fakeImage, photoForm, mediaPath } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

let app;
let sales;
let ops;
let viewer;
let admin;
let Itinerary;
let Right;
let photoA;
let photoB;

const api = (path, opts = {}) => app.call(`/api/itineraries${path}`, opts);
const make = (over = {}) => ({ title: 'Bali Escape', destination: 'Bali, Indonesia', country: 'Indonesia', nights: 5, summary: '<p>A <strong>relaxing</strong> week.</p>', days: [{ title: 'Arrival', description: '<p>Welcome</p>', meals: 'Dinner', stay: 'Ubud' }], tags: ['beach'], ...over });
const create = async (token, over) => (await api('', { method: 'POST', token, json: make(over) })).body;
const uploadPhoto = async (token, w) => (await app.call(mediaPath('itinerary'), { method: 'POST', token, form: photoForm({ image: fakeImage.jpeg(w, 600, w) }) })).body.data;

before(async () => {
  app = await startDbApp();
  [sales, ops, viewer, admin] = await Promise.all(['Sales', 'Ops', 'Viewer', 'Admin'].map((r) => app.makeUser(r)));
  ({ default: Itinerary } = await import('../../src/models/Itinerary.js'));
  ({ default: Right } = await import('../../src/models/Right.js'));
  photoA = await uploadPhoto(sales.token, 801);
  photoB = await uploadPhoto(sales.token, 802);
});
after(async () => {
  await app.close();
});

test('create: a valid itinerary is saved with its owner, formatting cleaned and photo sizes taken from the server', async () => {
  const body = await create(sales.token, {
    summary: '<p onclick="x()">Hello <b>there</b></p><script>alert(1)</script>',
    photos: [{ token: photoA.token, caption: 'Pool', width: 1, height: 1 }],
    days: [{ title: 'Day one', description: '<p>x</p>', photos: [{ token: photoB.token }] }]
  });
  assert.equal(body.success, true, body.message);
  const d = body.data;
  assert.equal(d.summary, '<p>Hello <strong>there</strong></p>');
  assert.equal(d.photos[0].width, photoA.width, 'size comes from the stored photo, not from the request');
  assert.equal(d.photos[0].caption, 'Pool');
  assert.equal(d.days[0].photos[0].token, photoB.token);
  assert.equal(d.createdBy, String(sales.user._id));
  assert.equal(d.status, 'Active');
  assert.equal(d.__v, undefined);
  assert.equal(d.deleted, undefined);
});

test('create: every problem is explained in plain language', async () => {
  const cases = [
    [{ title: '' }, /Please enter a title for the itinerary/],
    [{ destination: '   ' }, /Please enter the destination/],
    [{ nights: 99 }, /whole number from 0 to 60/],
    [{ days: [{ description: 'x' }] }, /Please enter a title for Day 1/],
    [{ photos: [{ token: 'AAAAAAAAAAAAAAAAAAAAAAAA' }] }, /no longer available/],
    [{ days: [{ title: 'd', photos: [{ token: '../x' }] }] }, /not valid/],
    [{ title: { $ne: 1 } }, /must be text/]
  ];
  for (const [over, message] of cases) {
    const r = await api('', { method: 'POST', token: sales.token, json: make(over) });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, false);
    assert.match(r.body.message, message);
  }
});

test('create/read: needs a session and the right permissions', async () => {
  assert.equal((await api('')).status, 401);
  assert.equal((await api('', { method: 'POST', json: make() })).status, 401);
  const denied = await api('', { method: 'POST', token: viewer.token, json: make() });
  assert.equal(denied.body.success, false);
  assert.match(denied.body.message, /Permission Denied/);
  assert.equal((await api('', { token: viewer.token })).body.success, true, 'everyone may read');
});

test('list: pagination, search, filters, sorting and a lean payload', async () => {
  await Itinerary.deleteMany({});
  const docs = Array.from({ length: 25 }, (_, i) => ({
    title: `Trip ${String(i).padStart(2, '0')} ${i % 5 === 0 ? 'Honeymoon' : 'Family'}`,
    destination: ['Bali', 'Dubai', 'Maldives', 'Kashmir', 'Japan'][i % 5],
    country: 'X',
    nights: i % 7,
    tags: i % 5 === 0 ? ['honeymoon'] : [],
    days: [{ title: 'd', description: 'LONG TEXT '.repeat(100), photos: i === 0 ? [{ token: photoA.token, width: 800, height: 600 }] : [] }, { title: 'e', description: '' }],
    status: i === 24 ? 'Archived' : 'Active',
    createdBy: String(sales.user._id),
    createdByName: 'Seed'
  }));
  await Itinerary.insertMany(docs);

  const first = (await api('?limit=10', { token: sales.token })).body;
  assert.equal(first.success, true);
  assert.equal(first.total, 24, 'archived ones are hidden by default');
  assert.equal(first.pages, 3);
  assert.equal(first.data.length, 10);
  assert.equal(first.data[0].days, undefined, 'the list never carries the day texts');
  assert.equal(first.data[0].dayCount, 2);
  assert.ok('photoCount' in first.data[0]);

  const page3 = (await api('?limit=10&page=3', { token: sales.token })).body;
  assert.equal(page3.data.length, 4);
  assert.equal((await api('?limit=10&page=99', { token: sales.token })).body.data.length, 0);
  assert.equal((await api('?limit=1000', { token: sales.token })).body.limit, 50, 'limit is capped');
  assert.equal((await api('?limit=-5&page=abc', { token: sales.token })).body.limit, 1);

  const search = (q) => api(`?search=${encodeURIComponent(q)}`, { token: sales.token }).then((r) => r.body);
  assert.equal((await search('honeymoon')).total, 5, 'title or tag, any case');
  assert.equal((await search('DUBAI')).total, 5);
  assert.equal((await search('.*')).total, 0, 'a search is literal text, not a pattern');
  assert.equal((await search('(')).total, 0, 'broken pattern characters are harmless');
  assert.equal((await search('Trip 07')).total, 1);

  assert.equal((await api('?destination=bali', { token: sales.token })).body.total, 5);
  assert.equal((await api('?status=Archived', { token: sales.token })).body.total, 1);
  assert.equal((await api('?status=all', { token: sales.token })).body.total, 25);

  const byTitle = (await api('?sort=title&limit=3', { token: sales.token })).body.data.map((r) => r.title);
  assert.deepEqual(byTitle, [...byTitle].sort());

  const withPhoto = (await api('?search=Trip 00', { token: sales.token })).body.data[0];
  assert.equal(withPhoto.cover.token, photoA.token, 'cover falls back to the first day photo');
  assert.equal(withPhoto.photoCount, 1);
});

test('list: query-string tricks are ignored, not turned into database operators', async () => {
  for (const q of ['?search[$ne]=x', '?status[$ne]=Active', '?destination[$regex]=.*', '?sort[$gt]=1', '?page[$gt]=0', '?search=a&search=b']) {
    const r = await api(q, { token: sales.token });
    assert.equal(r.status, 200, q);
    assert.equal(r.body.success, true, q);
  }
  assert.equal((await api('?search[$ne]=x', { token: sales.token })).body.total, 24, 'treated as no search at all');
});

test('get one: found, not found, bad id, and deleted ones are gone', async () => {
  const created = (await create(sales.token, { title: 'Findable' })).data;
  const ok = await api(`/${created._id}`, { token: viewer.token });
  assert.equal(ok.body.data.title, 'Findable');
  assert.equal(ok.body.data.days[0].title, 'Arrival');
  for (const id of ['000000000000000000000000', 'not-an-id', '%7B%22%24ne%22%3A1%7D']) {
    const r = await api(`/${id}`, { token: sales.token });
    assert.equal(r.body.success, false, id);
    assert.match(r.body.message, /not found/i);
  }
});

test('update: partial changes, formatting cleaned, and the audit trail follows the editor', async () => {
  const created = (await create(sales.token)).data;
  const r = await api(`/${created._id}`, { method: 'PUT', token: ops.token, json: { title: 'Bali Deluxe', summary: '<p><script>x</script>New <em>text</em></p>' } });
  assert.equal(r.body.success, true, r.body.message);
  assert.equal(r.body.data.title, 'Bali Deluxe');
  assert.equal(r.body.data.summary, '<p>New <em>text</em></p>');
  assert.equal(r.body.data.destination, 'Bali, Indonesia', 'fields that were not sent are untouched');
  assert.equal(r.body.data.days.length, 1);
  assert.equal(r.body.data.createdBy, String(sales.user._id));
  assert.equal(r.body.data.updatedBy, String(ops.user._id));
  assert.equal(r.body.data.__v, undefined);

  const bad = await api(`/${created._id}`, { method: 'PUT', token: sales.token, json: { nights: 500 } });
  assert.match(bad.body.message, /whole number/);
  const attack = await api(`/${created._id}`, { method: 'PUT', token: sales.token, json: { createdBy: 'x', deleted: true, status: 'Active', $set: { title: 'x' } } });
  assert.equal(attack.body.success, true);
  const after = (await api(`/${created._id}`, { token: sales.token })).body.data;
  assert.equal(after.createdBy, String(sales.user._id), 'ownership cannot be rewritten');
  assert.equal(after.title, 'Bali Deluxe');
});

test('update: a second editor is told, instead of silently overwriting the first', async () => {
  const created = (await create(sales.token, { title: 'Shared' })).data;
  const loaded = (await api(`/${created._id}`, { token: sales.token })).body.data;

  const first = await api(`/${created._id}`, { method: 'PUT', token: sales.token, json: { title: 'Shared v2', updatedAt: loaded.updatedAt } });
  assert.equal(first.body.success, true);

  const second = await api(`/${created._id}`, { method: 'PUT', token: ops.token, json: { title: 'Shared v3', updatedAt: loaded.updatedAt } });
  assert.equal(second.body.success, false);
  assert.match(second.body.message, /changed by .+ while you were editing it\. Please reload/);
  assert.equal((await api(`/${created._id}`, { token: sales.token })).body.data.title, 'Shared v2');

  const reloaded = (await api(`/${created._id}`, { token: ops.token })).body.data;
  const retry = await api(`/${created._id}`, { method: 'PUT', token: ops.token, json: { title: 'Shared v3', updatedAt: reloaded.updatedAt } });
  assert.equal(retry.body.success, true);
});

test('update: two saves of the same version at the same moment, exactly one wins', async () => {
  const created = (await create(sales.token, { title: 'Race' })).data;
  const loaded = (await api(`/${created._id}`, { token: sales.token })).body.data;
  const results = await Promise.all(
    ['A', 'B', 'C', 'D'].map((t) => api(`/${created._id}`, { method: 'PUT', token: sales.token, json: { title: `Race ${t}`, updatedAt: loaded.updatedAt } }))
  );
  assert.equal(results.filter((r) => r.body.success).length, 1);
  assert.equal(results.filter((r) => !r.body.success).every((r) => /while you were editing/.test(r.body.message)), true);
});

test('update: a person whose "edit others" right was taken away may only change their own', async () => {
  const mine = (await create(ops.token, { title: 'Ops own' })).data;
  const theirs = (await create(sales.token, { title: 'Sales own' })).data;
  await Right.create({ userId: String(ops.user._id), module: 'itineraries', canRead: true, canCreate: true, canUpdate: true, canEditOthers: false, canDelete: false, canDownload: false });
  try {
    assert.equal((await api(`/${mine._id}`, { method: 'PUT', token: ops.token, json: { title: 'still mine' } })).body.success, true);
    const r = await api(`/${theirs._id}`, { method: 'PUT', token: ops.token, json: { title: 'hijack' } });
    assert.equal(r.body.success, false);
    assert.match(r.body.message, /Access Restricted/);
  } finally {
    await Right.deleteMany({ userId: String(ops.user._id) });
  }
});

test('update/delete: the Viewer role cannot change anything', async () => {
  const created = (await create(sales.token)).data;
  assert.match((await api(`/${created._id}`, { method: 'PUT', token: viewer.token, json: { title: 'x' } })).body.message, /Permission Denied/);
  assert.match((await api(`/${created._id}`, { method: 'DELETE', token: viewer.token })).body.message, /Permission Denied/);
  assert.match((await api(`/${created._id}/duplicate`, { method: 'POST', token: viewer.token })).body.message, /Permission Denied/);
});

test('duplicate: an independent copy owned by the person who made it', async () => {
  const source = (await create(sales.token, { title: 'Original', photos: [{ token: photoA.token }] })).data;
  const r = await api(`/${source._id}/duplicate`, { method: 'POST', token: ops.token });
  assert.equal(r.body.success, true);
  const copy = r.body.data;
  assert.notEqual(copy._id, source._id);
  assert.equal(copy.title, 'Copy of Original');
  assert.equal(copy.createdBy, String(ops.user._id));
  assert.equal(copy.days[0].title, 'Arrival');
  assert.equal(copy.photos[0].token, photoA.token);
  await api(`/${copy._id}`, { method: 'PUT', token: ops.token, json: { title: 'Changed copy', days: [] } });
  assert.equal((await api(`/${source._id}`, { token: sales.token })).body.data.days.length, 1, 'editing the copy never touches the original');
  const long = (await create(sales.token, { title: 'T'.repeat(150) })).data;
  assert.equal((await api(`/${long._id}/duplicate`, { method: 'POST', token: sales.token })).body.data.title.length, 150);
});

test('archive and delete: archived ones leave the default list; only people with delete rights can remove', async () => {
  const created = (await create(sales.token, { title: 'To archive' })).data;
  assert.equal((await api(`/${created._id}`, { method: 'PUT', token: sales.token, json: { status: 'Archived' } })).body.data.status, 'Archived');
  const active = (await api('?search=To archive', { token: sales.token })).body;
  assert.equal(active.total, 0);
  assert.equal((await api('?search=To archive&status=Archived', { token: sales.token })).body.total, 1);
  assert.match((await api(`/${created._id}`, { method: 'PUT', token: sales.token, json: { status: 'Gone' } })).body.message, /Status must be one of/);

  assert.match((await api(`/${created._id}`, { method: 'DELETE', token: sales.token })).body.message, /Permission Denied/);
  const del = await api(`/${created._id}`, { method: 'DELETE', token: admin.token });
  assert.equal(del.body.success, true);
  assert.match((await api(`/${created._id}`, { token: sales.token })).body.message, /not found/i);
  assert.equal((await api('?status=all&search=To archive', { token: sales.token })).body.total, 0);
  assert.match((await api(`/${created._id}`, { method: 'DELETE', token: admin.token })).body.message, /not found/i);
});

test('destinations: the filter list counts active itineraries per destination', async () => {
  const r = (await api('/destinations', { token: sales.token })).body;
  assert.equal(r.success, true);
  const bali = r.data.find((x) => x.destination === 'Bali');
  assert.ok(bali && bali.count >= 5);
  assert.deepEqual(r.data.map((x) => x.destination), [...r.data.map((x) => x.destination)].sort());
});

test('photos used by an itinerary are never treated as unused by the storage clean-up', async () => {
  const { findOrphans } = await import('../../src/services/mediaCleanup.js');
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const Media = (await import('../../src/models/Media.js')).default;
  const used = await uploadPhoto(sales.token, 811);
  const unused = await uploadPhoto(sales.token, 812);
  await create(sales.token, { title: 'Uses a photo', days: [{ title: 'd', photos: [{ token: used.token }] }] });
  const longAgo = new Date(Date.now() - 3 * 86400000);
  await Media.collection.updateMany({ token: { $in: [used.token, unused.token] } }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });
  const orphans = (await findOrphans(await getMediaSources())).map((m) => m.token);
  assert.ok(!orphans.includes(used.token), 'a photo on a day of an itinerary is in use');
  assert.ok(orphans.includes(unused.token));
});

test('property: hostile payloads never cause a server error, and nothing dangerous is stored', async () => {
  const bit = fc.oneof(
    fc.string({ maxLength: 30 }),
    fc.constantFrom('<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '{"$ne":1}', '../../etc/passwd', '\u0000', 'x'.repeat(9000)),
    fc.integer(),
    fc.constant(null),
    fc.array(fc.string({ maxLength: 8 }), { maxLength: 3 })
  );
  const day = fc.record({ title: bit, description: bit, meals: bit, stay: bit, photos: fc.oneof(bit, fc.array(fc.record({ token: bit, caption: bit }), { maxLength: 3 })) }, { requiredKeys: [] });
  const body = fc.record({ title: bit, destination: bit, nights: bit, summary: bit, days: fc.oneof(bit, fc.array(day, { maxLength: 4 })), tags: bit, inclusions: bit }, { requiredKeys: [] });
  await fc.assert(
    fc.asyncProperty(body, async (json) => {
      const r = await api('', { method: 'POST', token: sales.token, json });
      assert.ok(r.status < 500, `status ${r.status}`);
      assert.equal(typeof r.body.success, 'boolean');
      if (r.body.success) {
        // Formatted fields are whitelisted HTML. Plain-text fields (titles, or text with no formatting) are kept as typed and
        // always shown as text, so angle brackets in them are harmless.
        const d = r.body.data;
        for (const value of [d.summary, ...d.days.map((x) => x.description), ...d.inclusions, ...d.exclusions]) {
          if (/^\s*<(?:p|ul|ol)[\s>/]/i.test(value)) assert.doesNotMatch(value, /<script|<img|\sonerror=/i);
        }
      } else {
        assert.equal(typeof r.body.message, 'string');
      }
    }),
    { numRuns: 60 }
  );
});
