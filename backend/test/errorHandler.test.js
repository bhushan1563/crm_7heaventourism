import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errorHandler.js';

const handle = (err) => {
  const out = {};
  const res = {
    headersSent: false,
    status(code) { out.status = code; return this; },
    json(body) { out.body = body; return this; }
  };
  errorHandler(err, { method: 'POST', originalUrl: '/api/scanner/process' }, res, () => { out.passedOn = true; });
  return out;
};

test('cut-off or malformed multipart uploads are a 400, not a 500', () => {
  for (const message of ['Unexpected end of form', 'Multipart: Boundary not found', 'Malformed part header', 'Unexpected end of multipart data', 'Part terminated early due to unexpected end of multipart data']) {
    const { status, body } = handle(new Error(message));
    assert.equal(status, 400, message);
    assert.equal(body.success, false);
    assert.match(body.message, /incomplete or malformed/);
  }
});

test('oversized uploads stay a 413 and file-type errors a 400 with their own message', () => {
  assert.equal(handle(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' })).status, 413);
  const type = handle(Object.assign(new Error('Only image files can be scanned.'), { code: 'UNSUPPORTED_FILE_TYPE' }));
  assert.equal(type.status, 400);
  assert.equal(type.body.message, 'Only image files can be scanned.');
});

test('unexpected errors stay a 500 JSON error', () => {
  const quiet = console.error;
  console.error = () => {}; // the handler logs the real error server-side
  try {
    const { status, body } = handle(new Error('something broke'));
    assert.equal(status, 500);
    assert.equal(body.success, false);
  } finally {
    console.error = quiet;
  }
});
