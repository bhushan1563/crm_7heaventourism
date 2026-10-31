import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const envModule = pathToFileURL(path.resolve(import.meta.dirname, '../src/config/env.js')).href;

// Runs validateConfig() in a clean process (cwd = tmp so dotenv can't read backend/.env) with exactly the given env.
const validate = (env) => {
  const code = `
    const { validateConfig } = await import(${JSON.stringify(envModule)});
    try { console.log(JSON.stringify({ ok: true, warnings: validateConfig() })); }
    catch (e) { console.log(JSON.stringify({ ok: false, message: e.message })); }
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ENV_FILE: path.join(os.tmpdir(), 'no-such.env'), ...env },
    encoding: 'utf8'
  });
  return JSON.parse(out.trim().split('\n').pop());
};

const good = { MONGODB_URI: 'mongodb://127.0.0.1/x', JWT_SECRET: 'a'.repeat(48) };

test('a complete production config is accepted', () => {
  assert.equal(validate({ ...good, NODE_ENV: 'production' }).ok, true);
});

test('production refuses to start without JWT_SECRET (no hard-coded fallback)', () => {
  const result = validate({ NODE_ENV: 'production', MONGODB_URI: good.MONGODB_URI });
  assert.equal(result.ok, false);
  assert.match(result.message, /JWT_SECRET is not set/);
});

test('the old hard-coded secret and the .env.example placeholder are rejected', () => {
  for (const secret of ['seven_heaven_jwt_secret_super_key_2026_luxury_travel', 'change-me-to-a-long-random-string']) {
    const result = validate({ NODE_ENV: 'production', MONGODB_URI: good.MONGODB_URI, JWT_SECRET: secret });
    assert.equal(result.ok, false, secret);
    assert.match(result.message, /placeholder/);
  }
});

test('missing MONGODB_URI is an error', () => {
  const result = validate({ NODE_ENV: 'production', JWT_SECRET: good.JWT_SECRET });
  assert.equal(result.ok, false);
  assert.match(result.message, /MONGODB_URI/);
});

test('a short secret only warns; development without a secret gets a random one and a warning', () => {
  const short = validate({ NODE_ENV: 'production', MONGODB_URI: good.MONGODB_URI, JWT_SECRET: 'short-but-unique-secret' });
  assert.equal(short.ok, true);
  assert.match(short.warnings.join(' '), /shorter than 32/);

  const dev = validate({ NODE_ENV: 'development', MONGODB_URI: good.MONGODB_URI });
  assert.equal(dev.ok, true);
  assert.match(dev.warnings.join(' '), /temporary random secret/);
});

test('ADMIN_PASSWORD must be strong enough when bootstrapping an admin', () => {
  const result = validate({ ...good, NODE_ENV: 'production', ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: '123' });
  assert.equal(result.ok, false);
  assert.match(result.message, /ADMIN_PASSWORD/);
});

test('the env file is found from any working directory (ENV_FILE), and real environment variables still win', async () => {
  const fs = await import('node:fs');
  const file = path.join(os.tmpdir(), `7heaven-test-${process.pid}.env`);
  fs.writeFileSync(file, `MONGODB_URI=mongodb://from-file/db\nJWT_SECRET=${'f'.repeat(48)}\nHOST=127.0.0.1\nPORT=6123\nNODE_ENV=production\n`);
  try {
    const code = `
      const { config, validateConfig } = await import(${JSON.stringify(envModule)});
      validateConfig();
      console.log(JSON.stringify({ uri: config.mongoUri, host: config.host, port: config.port, prod: config.isProduction }));
    `;
    const run = (extraEnv) =>
      JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: os.tmpdir(), // deliberately NOT the backend folder
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ENV_FILE: file, ...extraEnv },
        encoding: 'utf8'
      }).trim().split('\n').pop());

    assert.deepEqual(run({}), { uri: 'mongodb://from-file/db', host: '127.0.0.1', port: 6123, prod: true });
    assert.equal(run({ PORT: '7000' }).port, 7000, 'a real environment variable overrides the file');
  } finally {
    fs.rmSync(file, { force: true });
  }
});
