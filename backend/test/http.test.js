import { startApp } from './helpers.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

let server;
before(async () => {
  server = await startApp();
});
after(async () => {
  await server.close();
});

const call = async (path, options = {}) => {
  const res = await fetch(server.base + path, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { res, json, text };
};

test('health reports the database as down (503) instead of lying', async () => {
  const { res, json } = await call('/api/health');
  assert.equal(res.status, 503);
  assert.equal(json.database, 'disconnected');
});

test('unknown API routes return a JSON 404', async () => {
  const { res, json } = await call('/api/definitely-not-a-route');
  assert.equal(res.status, 404);
  assert.equal(json.success, false);
});

test('protected routes answer 401 JSON without a token', async () => {
  for (const [method, path] of [['GET', '/api/guests'], ['GET', '/api/users'], ['GET', '/api/rights/matrix'], ['POST', '/api/rights/bulk'], ['POST', '/api/scanner/process'], ['GET', '/api/auth/me']]) {
    const { res, json } = await call(path, { method });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(json.success, false);
  }
});

test('a token forged with the old hard-coded secret is rejected', async () => {
  const forged = jwt.sign({ id: '507f1f77bcf86cd799439011' }, 'seven_heaven_jwt_secret_super_key_2026_luxury_travel');
  const { res } = await call('/api/guests', { headers: { Authorization: `Bearer ${forged}` } });
  assert.equal(res.status, 401);
});

test('malformed JSON is a clean 400, not a stack trace', async () => {
  const { res, json, text } = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email": '
  });
  assert.equal(res.status, 400);
  assert.equal(json.success, false);
  assert.ok(!text.includes('at '), 'no stack trace in the response');
});

test('oversized JSON bodies are rejected with 413', async () => {
  const { res } = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(6 * 1024 * 1024) })
  });
  assert.equal(res.status, 413);
});

test('security headers are set and the framework is not advertised', async () => {
  const { res } = await call('/api/health');
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.match(res.headers.get('permissions-policy'), /camera=\(self\)/, 'the scanner needs the camera');
  const hsts = res.headers.get('strict-transport-security');
  assert.match(hsts, /max-age=31536000/);
  assert.ok(!/includeSubDomains/i.test(hsts), 'HSTS must not cover sibling subdomains');
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.ok(!/unsafe-inline[^;]*;[^]*script-src|script-src[^;]*unsafe-inline/.test(res.headers.get('content-security-policy')), 'scripts must not allow inline code');
});

test('login: operator-injection payloads are refused without touching the database', async () => {
  const { res, json } = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: { $ne: null }, password: { $ne: null } })
  });
  assert.equal(res.status, 200);
  assert.equal(json.success, false);
});

test('login is rate limited after repeated failures (and the response says so)', async () => {
  const attempt = () =>
    call('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: 'brute-force' }, password: 'x' })
    });

  let last;
  for (let i = 0; i < 12; i++) last = await attempt();
  assert.equal(last.res.status, 429);
  assert.equal(last.json.success, false);
  assert.match(last.json.message, /Too many/);
});
