import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from '../../src/utils/security.js';

// The company's people: an Admin sets and resets their passwords, they sign in with what they type (any capital letters, stray
// spaces), a new password ends their old sessions, and what each can do follows their rights.

const TEAM = [
  { email: 'package@7heaventourism.in', role: 'Sales', firstName: 'Package', lastName: 'Team' },
  { email: 'ops1@7heaventourism.in', role: 'Ops', firstName: 'Ops', lastName: 'One' },
  { email: 'support@7heaventourism.in', role: 'Viewer', firstName: 'Support', lastName: 'Desk' },
  { email: 'visa.7heaventourism@gmail.com', role: 'Sales', firstName: 'Visa', lastName: 'Desk' }
];

let app;
let admin;
const people = {};
const call = (path, opts) => app.call(path, opts);
const login = (email, password) => call('/api/auth/login', { method: 'POST', json: { email, password } });
// A session token records the time in whole seconds, so a reset in the very same second as the sign-in would not end it; real resets never are.
const aSecondLater = () => new Promise((resolve) => setTimeout(resolve, 1100));
const reset = (id, newPassword, token) => call(`/api/users/${id}/reset-password`, { method: 'POST', token: token ?? admin.token, json: { newPassword } });

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  for (const person of TEAM) {
    const made = await call('/api/users', { method: 'POST', token: admin.token, json: { ...person, password: 'First-pass-1', email: `  ${person.email.toUpperCase()} ` } });
    assert.equal(made.body.success, true, made.body.message);
    people[person.email] = made.body.data;
  }
});
after(async () => {
  await app.close();
});

test('the password rule says what is wrong in plain words', () => {
  assert.equal(passwordProblem('Strong-pass-1'), null);
  assert.equal(passwordProblem(''), 'Please enter a password.');
  assert.equal(passwordProblem(undefined), 'Please enter a password.');
  assert.equal(passwordProblem({ a: 1 }), 'Please enter a password.');
  assert.equal(passwordProblem('short'), `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  assert.equal(passwordProblem('x'.repeat(MAX_PASSWORD_LENGTH + 1)), `Password can be at most ${MAX_PASSWORD_LENGTH} characters.`);
  assert.equal(passwordProblem('x'.repeat(MAX_PASSWORD_LENGTH)), null);
  assert.equal(passwordProblem('é'.repeat(40)), `Password can be at most ${MAX_PASSWORD_LENGTH} characters.`, 'the limit is in bytes, which is what bcrypt honours');
  assert.equal(passwordProblem(' padded-pass '), 'The password must not start or end with a space.');
  assert.equal(passwordProblem('Package@7HeavenTourism.in', { email: 'package@7heaventourism.in' }), 'The password must not be the same as the email address.');
});

test('every person signs in however they type their email (capitals, stray spaces, a dotted Gmail address)', async () => {
  for (const { email } of TEAM) {
    for (const typed of [email, email.toUpperCase(), `  ${email}  `]) {
      const r = await login(typed, 'First-pass-1');
      assert.equal(r.body.success, true, `${typed}: ${r.body.message}`);
      assert.equal(r.body.user.email, email);
    }
  }
});

test('the same address cannot be registered twice, however it is typed', async () => {
  const again = await call('/api/users', { method: 'POST', token: admin.token, json: { email: 'OPS1@7heaventourism.IN', password: 'Another-pass-1', firstName: 'Dup', lastName: 'Licate', role: 'Ops' } });
  assert.equal(again.body.success, false);
  assert.match(again.body.message, /already/i);
});

test('an Admin resets a password: the old one stops working, the new one works, and old sessions end', async () => {
  const ops = people['ops1@7heaventourism.in'];
  const oldSession = (await login('ops1@7heaventourism.in', 'First-pass-1')).body.token;
  assert.equal((await call('/api/auth/me', { token: oldSession })).body.success, true);
  await aSecondLater();

  const done = await reset(ops._id, 'Brand-new-pass-9');
  assert.equal(done.body.success, true, done.body.message);
  assert.match(done.body.message, /Password changed for Ops One\. They were signed out on every device and must sign in with the new password\./);

  assert.equal((await login('ops1@7heaventourism.in', 'First-pass-1')).body.message, 'Invalid email or password.');
  assert.equal((await login('ops1@7heaventourism.in', 'Brand-new-pass-9')).body.success, true);
  const ended = await call('/api/auth/me', { token: oldSession });
  assert.equal(ended.status, 401, 'the session from before the reset is refused');
  assert.match(ended.body.message, /Your password was changed\. Please sign in again\./);
  assert.equal((await login('support@7heaventourism.in', 'First-pass-1')).body.success, true, 'other people are not affected');
});

test('a new password must follow the rule, and each problem is explained', async () => {
  const id = people['support@7heaventourism.in']._id;
  const cases = [
    ['', /Please enter a password/],
    ['short', /at least 8 characters/],
    ['x'.repeat(80), /at most 72 characters/],
    [' leading-space', /must not start or end with a space/],
    ['SUPPORT@7heaventourism.in', /same as the email address/],
    ['First-pass-1', /different from the current one/]
  ];
  for (const [password, message] of cases) {
    const r = await reset(id, password);
    assert.equal(r.body.success, false, password);
    assert.match(r.body.message, message);
  }
  assert.equal((await login('support@7heaventourism.in', 'First-pass-1')).body.success, true, 'nothing changed');
  assert.equal((await call(`/api/users/${id}/reset-password`, { method: 'POST', token: admin.token, json: {} })).body.success, false);
  assert.equal((await call(`/api/users/${id}/reset-password`, { method: 'POST', token: admin.token, json: { newPassword: { $ne: 1 } } })).body.success, false);
});

test('unknown people, your own account, and people who are not allowed are all refused in plain words', async () => {
  assert.equal((await reset('64b7f0f2a1b2c3d4e5f60718', 'Valid-pass-123')).body.message, 'User not found.');
  assert.equal((await reset(String(admin.user._id), 'Valid-pass-123')).body.message, 'To change your own password, use My Profile.');

  const sales = await login('package@7heaventourism.in', 'First-pass-1');
  const denied = await reset(people['visa.7heaventourism@gmail.com']._id, 'Valid-pass-123', sales.body.token);
  assert.equal(denied.body.success, false);
  assert.match(denied.body.message, /Permission Denied/);

  assert.equal((await call(`/api/users/${people['support@7heaventourism.in']._id}/reset-password`, { method: 'POST', json: { newPassword: 'Valid-pass-123' } })).status, 401);
});

test('someone who may edit users still cannot reset an Admin', async () => {
  const manager = await app.makeUser('Ops');
  await call('/api/rights', { method: 'POST', token: admin.token, json: { userId: String(manager.user._id), module: 'users', canRead: true, canUpdate: true } });
  const other = await app.makeUser('Admin');
  const refused = await reset(String(other.user._id), 'Valid-pass-123', manager.token);
  assert.equal(refused.body.success, false);
  assert.equal(refused.body.message, 'Only an Admin can manage Admin accounts.');
  const allowed = await reset(people['visa.7heaventourism@gmail.com']._id, 'Valid-pass-123', manager.token);
  assert.equal(allowed.body.success, true, 'but they can reset an ordinary team member');
});

test('editing a person also follows the password rule, and signs them out', async () => {
  const id = people['package@7heaventourism.in']._id;
  const session = (await login('package@7heaventourism.in', 'First-pass-1')).body.token;
  await aSecondLater();
  assert.match((await call(`/api/users/${id}`, { method: 'PUT', token: admin.token, json: { password: 'x'.repeat(80) } })).body.message, /at most 72 characters/);
  assert.match((await call(`/api/users/${id}`, { method: 'PUT', token: admin.token, json: { password: ' spaced-out ' } })).body.message, /must not start or end with a space/);
  const ok = await call(`/api/users/${id}`, { method: 'PUT', token: admin.token, json: { password: 'Edited-pass-77' } });
  assert.equal(ok.body.success, true, ok.body.message);
  assert.equal((await call('/api/auth/me', { token: session })).status, 401);
  assert.equal((await login('package@7heaventourism.in', 'Edited-pass-77')).body.success, true);
});

test('a deactivated person cannot sign in, and can again once reactivated', async () => {
  const id = people['support@7heaventourism.in']._id;
  const session = (await login('support@7heaventourism.in', 'First-pass-1')).body.token;
  assert.equal((await call(`/api/users/${id}/toggle-active`, { method: 'PATCH', token: admin.token })).body.success, true);
  const blocked = await login('support@7heaventourism.in', 'First-pass-1');
  assert.equal(blocked.body.success, false);
  assert.match(blocked.body.message, /deactivated|inactive/i);
  assert.notEqual((await call('/api/auth/me', { token: session })).body.success, true, 'a session that was already open stops working too');
  assert.equal((await call(`/api/users/${id}/toggle-active`, { method: 'PATCH', token: admin.token })).body.success, true);
  assert.equal((await login('support@7heaventourism.in', 'First-pass-1')).body.success, true);
});

test('each person can do what their role allows, and nothing more', async () => {
  const salesSession = (await login('visa.7heaventourism@gmail.com', 'Valid-pass-123')).body.token;
  const viewerSession = (await login('support@7heaventourism.in', 'First-pass-1')).body.token;
  const opsSession = (await login('ops1@7heaventourism.in', 'Brand-new-pass-9')).body.token;

  // everyone can read the guest list; nobody but an Admin can delete from it
  for (const token of [salesSession, viewerSession, opsSession]) assert.equal((await call('/api/guests', { token })).body.success, true);
  // a Viewer cannot add anything, others follow what an Admin saved (defaults: read only for quotations)
  const viewerCreate = await call('/api/quotations', { method: 'POST', token: viewerSession, json: { clientName: 'X', destination: 'Y' } });
  assert.match(viewerCreate.body.message, /Permission Denied/);
  assert.match((await call('/api/guests/64b7f0f2a1b2c3d4e5f60718', { method: 'DELETE', token: salesSession })).body.message, /Permission Denied/);
  // the hotel list works out of the box for Sales and Ops, but never for a Viewer
  assert.equal((await call('/api/hotels', { method: 'POST', token: salesSession, json: { name: 'Sales Hotel', city: 'Goa' } })).body.success, true);
  assert.equal((await call('/api/hotels', { method: 'POST', token: opsSession, json: { name: 'Ops Hotel', city: 'Goa' } })).body.success, true);
  assert.match((await call('/api/hotels', { method: 'POST', token: viewerSession, json: { name: 'Viewer Hotel', city: 'Goa' } })).body.message, /Permission Denied/);
  // nobody but an Admin touches users and rights
  for (const token of [salesSession, viewerSession, opsSession]) {
    assert.match((await call('/api/rights/matrix', { token })).body.message, /Permission Denied|Access Denied/);
    assert.match((await call('/api/users', { method: 'POST', token, json: { email: 'new@x.in', password: 'Valid-pass-123', firstName: 'N', lastName: 'P' } })).body.message, /Permission Denied/);
  }
});
