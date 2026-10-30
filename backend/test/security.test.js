import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegex, containsRegex, queryString, pick, omit, isValidEmail } from '../src/utils/security.js';

test('containsRegex treats user input literally (no regex injection / ReDoS)', () => {
  for (const hostile of ['(', '[a-', '.*', '(a+)+$', '\\', '$^']) {
    assert.doesNotThrow(() => containsRegex(hostile), `must not throw for ${hostile}`);
  }
  assert.ok(containsRegex('a.c').test('a.c'));
  assert.ok(!containsRegex('a.c').test('abc'), '"." must not match any character');
  assert.ok(containsRegex('PARIS').test('trip to paris'), 'case-insensitive');
  assert.equal(escapeRegex('a+b'), 'a\\+b');
});

test('queryString only accepts plain strings (blocks ?status[$ne]=x operator injection)', () => {
  assert.equal(queryString('Confirmed'), 'Confirmed');
  assert.equal(queryString('  x  '), 'x');
  assert.equal(queryString({ $ne: 'x' }), undefined);
  assert.equal(queryString(['a', 'b']), undefined);
  assert.equal(queryString(''), undefined);
  assert.equal(queryString(undefined), undefined);
});

test('pick keeps only allow-listed keys', () => {
  const out = pick({ guestNames: 'A', deleted: true, createdBy: 'x', $set: { a: 1 } }, ['guestNames', 'notes']);
  assert.deepEqual(out, { guestNames: 'A' });
});

test('omit drops protected keys and Mongo operators', () => {
  const out = omit({ clientName: 'A', deleted: true, createdBy: 'x', $set: { deleted: true }, nested: { ok: 1 } }, ['deleted', 'createdBy']);
  assert.deepEqual(out, { clientName: 'A', nested: { ok: 1 } });
});

test('isValidEmail', () => {
  assert.ok(isValidEmail('a@b.co'));
  assert.ok(!isValidEmail('nope'));
  assert.ok(!isValidEmail({ $ne: 1 }));
});
