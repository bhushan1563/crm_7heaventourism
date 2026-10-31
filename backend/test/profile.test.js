import { fakeRes } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import UserModel from '../src/models/User.js';
import RightModel from '../src/models/Right.js';
import { protect } from '../src/middleware/auth.js';
import { updateProfile, changePassword, setAvatar, removeAvatar } from '../src/controllers/authController.js';

const userId = () => new mongoose.Types.ObjectId();

// Bytes that start like the real format (the server checks the signature, not the pixels).
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(300, 7)]);
const dataUrl = (type, buf) => `data:image/${type};base64,${buf.toString('base64')}`;

const withStubs = async (stubs, fn) => {
  const originals = {};
  for (const [name, impl] of Object.entries(stubs)) {
    originals[name] = UserModel[name];
    UserModel[name] = impl;
  }
  try {
    return await fn();
  } finally {
    Object.assign(UserModel, originals);
  }
};

const call = async (handler, body, user = { _id: userId() }) => {
  const res = fakeRes();
  await handler({ body, user }, res);
  return res;
};

test('avatar: accepts real JPEG / PNG / WebP data URLs and stores exactly what was sent', async () => {
  for (const [type, make] of [['jpeg', jpeg], ['png', png], ['webp', webp]]) {
    let stored;
    const image = dataUrl(type, make());
    const res = await withStubs(
      { findByIdAndUpdate: (id, update) => ({ select: async () => ((stored = update), { avatar: update.avatar }) }) },
      () => call(setAvatar, { image })
    );
    assert.equal(res.body.success, true, type);
    assert.equal(stored.avatar, image);
  }
});

test('avatar: rejects SVG, other types, wrong signatures, oversized and non-string input', async () => {
  const cases = [
    ['svg', 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"></svg>' + ' '.repeat(200)).toString('base64'), /Only JPG, PNG or WebP/],
    ['html', 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>'.padEnd(300)).toString('base64'), /Only JPG, PNG or WebP/],
    ['not a data url', 'https://example.com/a.png', /Only JPG, PNG or WebP/],
    ['png label, text bytes', dataUrl('png', Buffer.alloc(300, 65)), /not a valid image/],
    ['jpeg label, png bytes', dataUrl('jpeg', png()), /not a valid image/],
    ['too large', dataUrl('jpeg', Buffer.concat([jpeg(), Buffer.alloc(200000, 1)])), /too large/],
    ['object', { $ne: 1 }, /choose a photo/],
    ['empty', '', /choose a photo/]
  ];
  for (const [name, image, message] of cases) {
    const res = await withStubs({ findByIdAndUpdate: () => { throw new Error('must not be saved'); } }, () => call(setAvatar, { image }));
    assert.equal(res.body.success, false, name);
    assert.match(res.body.message, message, name);
  }
});

test('avatar: remove clears the photo', async () => {
  let update;
  const res = await withStubs({ findByIdAndUpdate: (id, u) => ({ select: async () => ((update = u), { avatar: '' }) }) }, () => call(removeAvatar, {}));
  assert.equal(res.body.success, true);
  assert.deepEqual(update, { avatar: '' });
});

test('profile: validates names and phone, trims, and only writes the three allowed fields', async () => {
  const bad = async (body) => (await withStubs({ findByIdAndUpdate: () => { throw new Error('must not be saved'); } }, () => call(updateProfile, body))).body;
  assert.match((await bad({ firstName: '  ', lastName: 'B' })).message, /required/);
  assert.match((await bad({ firstName: 'A', lastName: 'B', phone: 'call me' })).message, /valid phone/);
  assert.match((await bad({ firstName: 'A'.repeat(51), lastName: 'B' })).message, /at most 50/);
  assert.match((await bad({ firstName: { $ne: 1 }, lastName: 'B' })).message, /must be text/);

  let update;
  const res = await withStubs({ findByIdAndUpdate: (id, u) => ({ select: async () => ((update = u), u) }) }, () =>
    call(updateProfile, { firstName: ' Ana ', lastName: 'Rao', phone: '+91 98765 43210', role: 'Admin', email: 'x@y.co', active: false })
  );
  assert.equal(res.body.success, true);
  assert.deepEqual(update, { firstName: 'Ana', lastName: 'Rao', phone: '+91 98765 43210' }, 'role/email/active cannot be changed here');
});

test('password: rules, wrong current password, and a successful change that issues a fresh token', async () => {
  const hash = await bcrypt.hash('old-password-1', 4);
  const mk = () => ({ _id: userId(), password: hash, async save() { this.saved = true; } });
  const attempt = async (body, doc = mk()) => ({ doc, res: await withStubs({ findById: async () => doc }, () => call(changePassword, body, doc)) });

  assert.match((await attempt({ currentPassword: 'old-password-1', newPassword: 'short' })).res.body.message, /at least 8/);
  assert.match((await attempt({ currentPassword: 'old-password-1', newPassword: 'x'.repeat(73) })).res.body.message, /at most 72/);
  assert.match((await attempt({ currentPassword: 'old-password-1', newPassword: 'old-password-1' })).res.body.message, /different/);
  assert.match((await attempt({ currentPassword: 'wrong-password-9', newPassword: 'new-password-2' })).res.body.message, /current password is incorrect/);
  assert.match((await attempt({ currentPassword: { $ne: 1 }, newPassword: 'new-password-2' })).res.body.message, /enter your current password/);

  const { doc, res } = await attempt({ currentPassword: 'old-password-1', newPassword: 'new-password-2' });
  assert.equal(res.body.success, true);
  assert.equal(doc.saved, true);
  assert.equal(doc.password, 'new-password-2', 'handed to the model, which hashes it in its pre-save hook');
  assert.ok(doc.passwordChangedAt instanceof Date);
  assert.equal(res.locals.passwordChanged, true, 'the rate limiter is told this attempt succeeded');
  assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).id, String(doc._id), 'a fresh token for this device');
});

test('sessions issued before a password change are rejected, newer ones are not', async () => {
  const id = userId();
  const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const user = { _id: id, role: 'Sales', active: true, deleted: false, passwordChangedAt: changedAt };
  const sign = (iat) => jwt.sign({ id: String(id), iat }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const run = async (token) => {
    const res = fakeRes();
    let nexted = false;
    const originalRights = RightModel.find;
    RightModel.find = () => ({ lean: async () => [] });
    try {
      await withStubs({ findById: () => ({ select: async () => user }) }, () => protect({ headers: { authorization: `Bearer ${token}` } }, res, () => (nexted = true)));
    } finally {
      RightModel.find = originalRights;
    }
    return { res, nexted };
  };

  const nowSec = Math.floor(changedAt.getTime() / 1000);
  const stale = await run(sign(nowSec - 600));
  assert.equal(stale.nexted, false);
  assert.equal(stale.res.statusCode, 401);
  assert.match(stale.res.body.message, /password was changed/);

  assert.equal((await run(sign(nowSec))).nexted, true, 'the token issued with the change itself still works');
  assert.equal((await run(sign(nowSec + 5))).nexted, true);
});
