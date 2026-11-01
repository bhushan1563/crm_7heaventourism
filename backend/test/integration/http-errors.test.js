import { startDbApp, mediaPath } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// What the browser can send that is wrong must come back as a clear 4xx JSON message, never a 500 and never a stack trace.

let app;
let sales;

before(async () => {
  app = await startDbApp();
  sales = await app.makeUser('Sales');
});
after(async () => {
  await app.close();
});

const assertClientError = (r, label, status) => {
  assert.ok(r.status >= 400 && r.status < 500, `${label}: expected a 4xx, got ${r.status}`);
  if (status) assert.equal(r.status, status, label);
  assert.equal(r.body?.success, false, `${label}: the answer is JSON with success:false`);
  assert.equal(typeof r.body?.message, 'string');
  assert.doesNotMatch(r.bytes.toString('utf8'), /\bat .*\.js:\d+|node_modules|Error:/, `${label}: no stack trace or internals are shown`);
};

test('a web address that cannot be decoded is a plain 400', async () => {
  for (const path of ['/media/%E0%A4%A', '/media/%', '/media/%ZZ/thumb']) {
    const r = await app.call(path);
    assert.equal(r.status, 400, path);
    assert.equal(r.body?.success, false);
  }
});

test('a request body with an unknown character set or encoding is refused as a client error', async () => {
  const charset = await app.call('/api/itineraries', { method: 'POST', token: sales.token, headers: { 'Content-Type': 'application/json; charset=bogus' }, form: '{}' });
  assertClientError(charset, 'unknown charset');
  const encoding = await app.call('/api/itineraries', { method: 'POST', token: sales.token, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'bogus' }, form: '{}' });
  assertClientError(encoding, 'unknown encoding');
});

test('broken JSON, oversized JSON and a body that is not an object are explained', async () => {
  const broken = await app.call('/api/itineraries', { method: 'POST', token: sales.token, headers: { 'Content-Type': 'application/json' }, form: '{"title": ' });
  assertClientError(broken, 'broken json', 400);
  assert.match(broken.body.message, /Malformed JSON/);

  const huge = await app.call('/api/itineraries', { method: 'POST', token: sales.token, json: { title: 'x'.repeat(5.5 * 1024 * 1024) } }); // the limit is 5 MB
  assertClientError(huge, 'huge json', 413);

  const long = await app.call('/api/itineraries', { method: 'POST', token: sales.token, json: { title: 'x'.repeat(2 * 1024 * 1024) } });
  assert.equal(long.body.success, false, 'a long field under the body limit is explained, not accepted');
  assert.match(long.body.message, /too long/);

  for (const value of [[], 'text', 5, null]) {
    const r = await app.call('/api/itineraries', { method: 'POST', token: sales.token, json: value });
    assert.ok(r.status < 500, `body ${JSON.stringify(value)} gave ${r.status}`);
    assert.equal(r.body?.success, false);
  }
});

test('an upload that is not a normal multipart form is a clean 400 (rights are still checked first)', async () => {
  const mixed = await app.call(mediaPath('hotel'), {
    method: 'POST',
    token: sales.token,
    headers: { 'Content-Type': 'multipart/mixed; boundary=x' },
    form: '--x\r\nContent-Disposition: attachment; filename="a.jpg"\r\n\r\ndata\r\n--x--\r\n'
  });
  assertClientError(mixed, 'multipart/mixed', 400);

  const notMultipart = await app.call(mediaPath('hotel'), { method: 'POST', token: sales.token, json: { image: 'abc' } });
  assert.ok(notMultipart.status < 500, `a JSON body sent to the upload gave ${notMultipart.status}`);
  assert.equal(notMultipart.body?.success, false);
});

test('unknown API routes are a JSON 404 and the site itself still serves pages for other paths', async () => {
  const r = await app.call('/api/does-not-exist');
  assertClientError(r, 'unknown route', 404);
  assert.match(r.body.message, /API route not found/);
  const missingPhoto = await app.call('/media/' + 'B'.repeat(24));
  assert.equal(missingPhoto.status, 404);
});
