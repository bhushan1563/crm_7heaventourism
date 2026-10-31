import { startDbApp, fakeImage, photoForm } from './helpers-db.js';
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

const upload = (token, opts) => app.call('/api/media', { method: 'POST', token, form: photoForm(opts) });
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
  const anon = await app.call('/api/media', { method: 'POST', form: photoForm({ image: jpg() }) });
  assert.equal(anon.status, 401);

  const noPurpose = await upload(sales.token, { image: jpg(), purpose: null });
  assert.match(noPurpose.body.message, /Unknown upload type/);
  const badPurpose = await upload(sales.token, { image: jpg(), purpose: 'users' });
  assert.match(badPurpose.body.message, /Unknown upload type/);

  const viewerTry = await upload(viewer.token, { image: jpg(), purpose: 'hotel' });
  assert.equal(viewerTry.body.success, false);
  assert.match(viewerTry.body.message, /Permission Denied/);

  // Sales may work on hotels and itineraries by default, but not on quotations until an Admin grants it.
  assert.equal((await upload(sales.token, { image: jpg(640, 480, 11), purpose: 'itinerary' })).body.success, true);
  assert.equal((await upload(sales.token, { image: jpg(641, 480, 11), purpose: 'quotation' })).body.success, false);
  assert.equal((await upload(admin.token, { image: jpg(642, 480, 11), purpose: 'quotation' })).body.success, true);
});

test('upload: a malformed multipart body is a clean 400 JSON error', async () => {
  const { status, body } = await app.call('/api/media', {
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
  // Mongoose protects createdAt from updates, so back-date through the raw collection.
  await MediaModel.collection.updateMany({ token: { $in: [kept, orphan] } }, { $set: { createdAt: new Date(Date.now() - 3 * 86400000) } });

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
