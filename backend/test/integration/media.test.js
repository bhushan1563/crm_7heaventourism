import { startDbApp, fakeImage, photoForm, mediaPath } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

let app;
let sales;
let viewer;
let admin;
let MediaModel;

before(async () => {
  app = await startDbApp();
  sales = await app.makeUser('Sales');
  viewer = await app.makeUser('Viewer');
  admin = await app.makeUser('Admin');
  ({ default: MediaModel } = await import('../../src/models/Media.js'));
});
after(async () => {
  await app.close();
});

// What the photo is for travels in the address (it is checked before the file is read); purpose: null leaves it out.
const upload = (token, { purpose = 'hotel', ...opts } = {}) => app.call(mediaPath(purpose), { method: 'POST', token, form: photoForm(opts) });
const jpg = (w = 800, h = 600, pad = 2000) => fakeImage.jpeg(w, h, pad);

test('upload: a photo is stored and served back byte for byte, with long-lived caching and no way to run script', async () => {
  const image = jpg(1200, 900, 5000);
  const thumb = fakeImage.jpeg(400, 300, 800);
  const { body } = await upload(sales.token, { image, thumb, purpose: 'hotel' });
  assert.equal(body.success, true, body.message);
  assert.match(body.data.token, /^[A-Za-z0-9_-]{24}$/);
  assert.deepEqual([body.data.width, body.data.height, body.data.mime], [1200, 900, 'image/jpeg']);
  assert.equal(body.data.url, `/media/${body.data.token}`);

  const full = await app.call(body.data.url);
  assert.equal(full.status, 200);
  assert.deepEqual(full.bytes, image);
  assert.equal(full.res.headers.get('content-type'), 'image/jpeg');
  assert.match(full.res.headers.get('cache-control'), /public, max-age=31536000, immutable/);
  assert.equal(full.res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(full.res.headers.get('content-security-policy'), /default-src 'none'; sandbox/);

  const small = await app.call(body.data.thumbUrl);
  assert.deepEqual(small.bytes, thumb, 'the preview is a different, smaller image');
});

test('serve: a repeat request is answered from the ETag (304) and a missing preview falls back to the full photo', async () => {
  const image = jpg(900, 700, 1200);
  const { body } = await upload(sales.token, { image, purpose: 'itinerary' });
  const first = await app.call(body.data.url);
  const etag = first.res.headers.get('etag');
  assert.ok(etag);
  const again = await app.call(body.data.url, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
  const thumb = await app.call(body.data.thumbUrl);
  assert.equal(thumb.status, 200);
  assert.deepEqual(thumb.bytes, image);
});

test('dedupe: uploading the same photo again stores it once and returns the same token', async () => {
  const image = jpg(777, 555, 3333);
  const a = await upload(sales.token, { image, purpose: 'hotel' });
  const b = await upload(admin.token, { image, purpose: 'itinerary' });
  assert.equal(a.body.data.token, b.body.data.token);
  assert.equal(await MediaModel.countDocuments({ width: 777, height: 555 }), 1);
});

test('upload rejects files that are not usable photos, with plain-language messages', async () => {
  const cases = [
    [{ image: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), type: 'image/svg+xml', filename: 'x.svg' }, /not a usable photo/],
    [{ image: Buffer.from('<svg/>'), type: 'image/jpeg', filename: 'looks-like.jpg' }, /not a usable photo/],
    [{ image: Buffer.from('GIF89a' + 'x'.repeat(100)), type: 'image/gif' }, /JPG, PNG or WebP/],
    [{ image: fakeImage.jpeg(6000, 100, 100) }, /too large \(6000 x 100 pixels\)/],
    [{ image: jpg(), thumb: Buffer.from('garbage-not-an-image') }, /preview image is not valid/],
    [{ image: jpg(), thumb: fakeImage.jpeg(4000, 3000, 100) }, /preview image is not valid/],
    [{ image: null }, /choose a photo/]
  ];
  for (const [opts, message] of cases) {
    const { status, body } = await upload(sales.token, opts);
    assert.equal(status, 200);
    assert.equal(body.success, false);
    assert.match(body.message, message);
  }
});

test('upload: a photo over the size limit is refused with a message, not a crash', async () => {
  const { status, body } = await upload(sales.token, { image: jpg(1000, 800, 2 * 1024 * 1024 + 10) });
  assert.equal(status, 200);
  assert.equal(body.success, false);
  assert.match(body.message, /larger than 2 MB/);
});

test('upload: needs a session, a known purpose and create/update rights on that module', async () => {
  const anon = await app.call(mediaPath('hotel'), { method: 'POST', form: photoForm({ image: jpg() }) });
  assert.equal(anon.status, 401);

  const noPurpose = await upload(sales.token, { image: jpg(), purpose: null });
  assert.match(noPurpose.body.message, /Unknown upload type/);
  const badPurpose = await upload(sales.token, { image: jpg(), purpose: 'users' });
  assert.match(badPurpose.body.message, /Unknown upload type/);
  for (const inherited of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const r = await upload(admin.token, { image: jpg(), purpose: inherited });
    assert.match(r.body.message, /^Unknown upload type/, `${inherited} is not an upload type`);
  }

  const viewerTry = await upload(viewer.token, { image: jpg(), purpose: 'hotel' });
  assert.equal(viewerTry.body.success, false);
  assert.match(viewerTry.body.message, /Permission Denied/);

  // Sales may work on hotels and itineraries by default, but not on quotations until an Admin grants it.
  assert.equal((await upload(sales.token, { image: jpg(640, 480, 11), purpose: 'itinerary' })).body.success, true);
  assert.equal((await upload(sales.token, { image: jpg(641, 480, 11), purpose: 'quotation' })).body.success, false);
  assert.equal((await upload(admin.token, { image: jpg(642, 480, 11), purpose: 'quotation' })).body.success, true);
});

test('upload: a malformed multipart body is a clean 400 JSON error', async () => {
  const { status, body } = await app.call(mediaPath('hotel'), {
    method: 'POST',
    token: sales.token,
    headers: { 'Content-Type': 'multipart/form-data; boundary=----x' },
    form: '------x\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n\r\ntruncated'
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /incomplete or malformed/);
});

test('serve: bad, unknown and hostile tokens are a plain 404 that is never cached', async () => {
  for (const path of [
    '/media/short',
    '/media/' + 'a'.repeat(80),
    '/media/..%2F..%2Fetc%2Fpasswd',
    '/media/%00%00%00%00%00%00%00%00%00%00%00%00%00%00',
    '/media/' + 'A'.repeat(24),
    '/media/' + 'A'.repeat(24) + '/thumb'
  ]) {
    const r = await app.call(path);
    assert.equal(r.status, 404, path);
    assert.ok(!/public/.test(r.res.headers.get('cache-control') || ''), `${path} must not be cached as public`);
  }
});

test('the photo-storage quota stops uploads with a clear message and the usage meter reports it (Admin only)', async () => {
  const before = app.config.mediaQuotaMb;
  try {
    const used = (await app.call('/api/media/usage', { token: admin.token })).body.data;
    assert.ok(used.count >= 1);
    assert.equal(used.quotaBytes, before * 1048576);

    app.config.mediaQuotaMb = (used.usedBytes + 5000) / 1048576; // room for almost nothing more
    const refused = await upload(sales.token, { image: jpg(901, 601, 20000), purpose: 'hotel' });
    assert.equal(refused.body.success, false);
    assert.match(refused.body.message, /Photo storage is full/);

    // A photo that is already stored is not new data, so re-adding it still works when the storage is full.
    const again = await upload(sales.token, { image: jpg(777, 555, 3333), purpose: 'hotel' });
    assert.equal(again.body.success, true);
  } finally {
    app.config.mediaQuotaMb = before;
  }
  assert.equal((await app.call('/api/media/usage', { token: sales.token })).body.success, false, 'Sales cannot see the meter');
});

test('property: whatever bytes are uploaded as a photo, the API answers with success:false or a stored photo, never a 5xx', async () => {
  await fc.assert(
    fc.asyncProperty(fc.uint8Array({ maxLength: 600 }), fc.constantFrom('image/jpeg', 'image/png', 'application/octet-stream'), async (bytes, type) => {
      const { status, body } = await upload(sales.token, { image: Buffer.from(bytes), type });
      assert.ok(status < 500, `status ${status}`);
      assert.equal(typeof body.success, 'boolean');
      if (!body.success) assert.equal(typeof body.message, 'string');
    }),
    { numRuns: 40 }
  );
});

test('clean-up: only photos nothing refers to, and older than the grace period, are removed', async () => {
  const { deleteOrphans, findOrphans, collectReferencedTokens } = await import('../../src/services/mediaCleanup.js');
  const mongoose = (await import('mongoose')).default;

  const kept = (await upload(admin.token, { image: jpg(111, 111, 77), purpose: 'hotel' })).body.data.token;
  const orphan = (await upload(admin.token, { image: jpg(222, 222, 77), purpose: 'hotel' })).body.data.token;
  const fresh = (await upload(admin.token, { image: jpg(333, 333, 77), purpose: 'hotel' })).body.data.token;
  // Mongoose protects createdAt from updates, so back-date through the raw collection (the grace period counts from lastUsedAt).
  const longAgo = new Date(Date.now() - 3 * 86400000);
  await MediaModel.collection.updateMany({ token: { $in: [kept, orphan] } }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });

  // A stand-in record type that references one photo the same way real records will: { token }.
  const Holder = mongoose.model('TestHolder', new mongoose.Schema({ photos: [{ token: String, width: Number }], note: String }));
  await Holder.create({ photos: [{ token: kept, width: 1 }], note: 'uses a photo' });
  const sources = [{ model: Holder, select: 'photos' }];

  assert.deepEqual([...(await collectReferencedTokens(sources))], [kept]);
  const found = (await findOrphans(sources)).map((m) => m.token);
  assert.deepEqual(found, [orphan], 'the fresh photo is protected by the grace period, the used one by its reference');

  const result = await deleteOrphans(sources);
  assert.equal(result.removed, 1);
  assert.ok(result.freedBytes > 0);
  assert.equal(await MediaModel.countDocuments({ token: orphan }), 0);
  assert.equal(await MediaModel.countDocuments({ token: { $in: [kept, fresh] } }), 2);
  assert.equal((await app.call(`/media/${orphan}`)).status, 404);
});

test('dedupe holds under a race: eight identical uploads at once store the photo once and all get the same token', async () => {
  const image = jpg(1234, 765, 4321);
  const results = await Promise.all(Array.from({ length: 8 }, () => upload(sales.token, { image, purpose: 'hotel' })));
  assert.ok(results.every((r) => r.body.success), results.map((r) => r.body.message).join(' | '));
  assert.equal(new Set(results.map((r) => r.body.data.token)).size, 1);
  assert.equal(await MediaModel.countDocuments({ width: 1234, height: 765 }), 1);
});

// ---------------------------------------------------------------- hardening found by the independent review

test('permission is checked BEFORE the file is read: a Viewer sending a broken body hears "permission denied", not "malformed"', async () => {
  const r = await app.call(mediaPath('hotel'), {
    method: 'POST',
    token: viewer.token,
    headers: { 'Content-Type': 'multipart/form-data; boundary=----x' },
    form: '------x\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n\r\ntruncated'
  });
  assert.equal(r.body.success, false);
  assert.match(r.body.message, /Permission Denied/);
});

test('incomplete, too-many-pixel and damaged photos are refused with a clear reason', async () => {
  const cut = fakeImage.jpeg(800, 600, 500).subarray(0, -2); // the closing marker is missing: an interrupted upload
  assert.match((await upload(sales.token, { image: cut })).body.message, /incomplete or damaged/);

  const cutPng = fakeImage.png(800, 600, 500).subarray(0, -6);
  assert.match((await upload(sales.token, { image: cutPng, type: 'image/png', filename: 'a.png' })).body.message, /incomplete or damaged/);

  const manyPixels = (await upload(sales.token, { image: fakeImage.jpeg(4500, 3000, 100) })).body;
  assert.equal(manyPixels.success, false);
  assert.match(manyPixels.message, /too large \(4500 x 3000 pixels\)\. It can have at most 12 megapixels/);

  assert.equal((await upload(sales.token, { image: fakeImage.jpeg(4000, 3000, 100) })).body.success, true, 'exactly 12 megapixels is allowed');
});

test('one person cannot add more than the daily limit, other people are not affected, and re-adding a stored photo is free', async () => {
  const before = app.config.mediaUserDailyMb;
  const busy = await app.makeUser('Sales');
  const other = await app.makeUser('Sales');
  try {
    app.config.mediaUserDailyMb = 0.03; // about 31 KB
    assert.equal((await upload(busy.token, { image: jpg(910, 600, 20000) })).body.success, true);
    const refused = await upload(busy.token, { image: jpg(911, 600, 20000) });
    assert.equal(refused.body.success, false);
    assert.match(refused.body.message, /already added .* of photos in the last 24 hours \(the limit is/);
    assert.equal((await upload(other.token, { image: jpg(912, 600, 20000) })).body.success, true);
    assert.equal((await upload(busy.token, { image: jpg(910, 600, 20000) })).body.success, true, 'a photo that is already stored costs nothing');
  } finally {
    app.config.mediaUserDailyMb = before;
  }
});

test('the storage limit holds even when many different photos arrive at the same moment', async () => {
  const before = app.config.mediaQuotaMb;
  const usedBefore = (await app.call('/api/media/usage', { token: admin.token })).body.data.usedBytes;
  try {
    app.config.mediaQuotaMb = (usedBefore + 450_000) / 1048576; // room for about four 100 KB photos
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => upload(admin.token, { image: jpg(930 + i, 600, 100_000) })));
    const stored = results.filter((r) => r.body.success).length;
    const usedAfter = (await app.call('/api/media/usage', { token: admin.token })).body.data.usedBytes;
    assert.ok(stored >= 1 && stored <= 5, `stored ${stored}`);
    assert.ok(usedAfter <= app.config.mediaQuotaMb * 1048576, `used ${usedAfter} of ${app.config.mediaQuotaMb * 1048576}`);
    for (const r of results.filter((x) => !x.body.success)) assert.match(r.body.message, /Photo storage is full/);
  } finally {
    app.config.mediaQuotaMb = before;
  }
});

test('dedupe: only the person who first uploaded a photo can add its preview', async () => {
  const owner = await app.makeUser('Sales');
  const stranger = await app.makeUser('Sales');
  const image = jpg(940, 600, 3000);
  const first = await upload(owner.token, { image }); // stored without a preview
  assert.equal(first.body.success, true, first.body.message);
  const thumbSizeOf = async () => (await MediaModel.findOne({ token: first.body.data.token }).select('thumbSize')).thumbSize;
  assert.equal(await thumbSizeOf(), 0);

  await upload(stranger.token, { image, thumb: fakeImage.jpeg(300, 200, 500) });
  assert.equal(await thumbSizeOf(), 0, 'somebody else cannot attach a preview to it');
  await upload(owner.token, { image, thumb: fakeImage.jpeg(300, 200, 500) });
  assert.ok((await thumbSizeOf()) > 0, 'the person who uploaded it can');
});

test('handing out a stored photo again counts as using it (the clean-up leaves it alone)', async () => {
  const { findOrphans } = await import('../../src/services/mediaCleanup.js');
  const { default: Itinerary } = await import('../../src/models/Itinerary.js');
  const sources = [{ model: Itinerary, select: 'photos days.photos' }];
  const image = jpg(950, 600, 1000);
  const token = (await upload(sales.token, { image })).body.data.token;
  const longAgo = new Date(Date.now() - 5 * 86400000);
  await MediaModel.collection.updateOne({ token }, { $set: { createdAt: longAgo, lastUsedAt: longAgo } });
  assert.ok((await findOrphans(sources)).some((m) => m.token === token), 'unused for days: a candidate');
  await upload(admin.token, { image }); // someone picks the same photo again
  assert.ok(!(await findOrphans(sources)).some((m) => m.token === token), 'just handed out: protected');
});

test('the clean-up refuses to run without the list of places that use photos, and that list covers every model with photos', async () => {
  const { findOrphans, deleteOrphans } = await import('../../src/services/mediaCleanup.js');
  await assert.rejects(() => findOrphans([]), /list of places that use photos/);
  await assert.rejects(() => deleteOrphans([]), /list of places that use photos/);

  // A schema that stores photo references (a sub-document with a `token`) must be registered with the clean-up, otherwise
  // its photos would be deleted a day after they were uploaded.
  const mongoose = (await import('mongoose')).default;
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const registered = new Set((await getMediaSources()).map((s) => s.model.modelName));
  assert.ok(registered.size > 0);
  const holdsPhotos = (schema) => Object.values(schema.paths).some((p) => p.schema && (p.schema.paths.token || holdsPhotos(p.schema)));
  for (const name of mongoose.modelNames()) {
    if (name === 'Media' || name === 'TestHolder') continue;
    if (holdsPhotos(mongoose.model(name).schema)) assert.ok(registered.has(name), `${name} stores photo references but is not registered in services/mediaSources.js`);
  }
});

test('a busy photo is served from memory: repeat requests do not reach the database', async () => {
  const token = (await upload(sales.token, { image: jpg(960, 600, 1500) })).body.data.token;
  assert.equal((await app.call(`/media/${token}`)).status, 200);
  await MediaModel.collection.deleteOne({ token }); // gone from the database ...
  assert.equal((await app.call(`/media/${token}`)).status, 200, '... yet the photo that was just requested still comes from memory');
});
