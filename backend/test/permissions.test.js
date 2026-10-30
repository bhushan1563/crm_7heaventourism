import { fakeRes } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import UserModel from '../src/models/User.js';
import RightModel from '../src/models/Right.js';
import { protect, resolveRights } from '../src/middleware/auth.js';
import { checkRights, checkRecordOwnership } from '../src/middleware/checkRights.js';

const oid = () => new mongoose.Types.ObjectId();
const user = (overrides = {}) => ({ _id: oid(), firstName: 'Sam', lastName: 'Sales', email: 'sam@x.co', role: 'Sales', active: true, deleted: false, ...overrides });

const ALL_OFF = { canCreate: false, canRead: true, canUpdate: false, canDelete: false, canDownload: false, canEditOthers: false };

test('resolveRights: admins get everything, users fall back to read-only', () => {
  const admin = resolveRights(user({ role: 'Admin' }), []);
  assert.ok(Object.values(admin.rights).every(Boolean), 'admin has every flag on the rights module');

  const sales = resolveRights(user(), []);
  assert.deepEqual(sales.guest_list, ALL_OFF);
  assert.deepEqual(sales.rights, ALL_OFF);
});

test('resolveRights: per-user override beats the role default', () => {
  const u = user();
  const rights = [
    { userRole: 'Sales', userId: null, module: 'guest_list', ...ALL_OFF, canUpdate: true },
    { userId: String(u._id), module: 'guest_list', ...ALL_OFF, canDelete: true }
  ];
  const merged = resolveRights(u, rights);
  assert.equal(merged.guest_list.canDelete, true);
  assert.equal(merged.guest_list.canUpdate, false, 'override replaces, not merges');
});

test('checkRights denies a missing permission and admits an admin', () => {
  const run = (u, rights) => {
    const res = fakeRes();
    let nexted = false;
    checkRights('rights', 'canUpdate')({ user: u, userRights: rights }, res, () => (nexted = true));
    return { res, nexted };
  };
  const denied = run(user(), resolveRights(user(), []));
  assert.equal(denied.nexted, false);
  assert.equal(denied.res.body.success, false);

  assert.equal(run(user({ role: 'Admin' }), {}).nexted, true);
});

// --- record ownership -------------------------------------------------------------------------------------------

const ownership = async ({ requester, record, rights = ALL_OFF }) => {
  const res = fakeRes();
  let nexted = false;
  const req = { user: requester, userRights: { guest_list: rights }, baseUrl: '/api/guests', params: { id: '1' } };
  await checkRecordOwnership(async () => record)(req, res, () => (nexted = true));
  return { nexted, body: res.body };
};

test('ownership: the creator can edit their own record (string id vs ObjectId)', async () => {
  const me = user();
  const result = await ownership({ requester: me, record: { createdBy: String(me._id), status: 'Under Process' } });
  assert.equal(result.nexted, true);
});

test('ownership: someone else cannot edit it without canEditOthers', async () => {
  const result = await ownership({ requester: user(), record: { createdBy: String(oid()), sales: 'Other Person', status: 'Under Process' } });
  assert.equal(result.nexted, false);
  assert.match(result.body.message, /not authorized/i);
});

test('ownership: canEditOthers allows editing an open record', async () => {
  const result = await ownership({
    requester: user(),
    record: { createdBy: String(oid()), sales: 'Other Person', status: 'Quoted' },
    rights: { ...ALL_OFF, canEditOthers: true }
  });
  assert.equal(result.nexted, true);
});

test('ownership: a confirmed booking stays locked for canEditOthers users who are not assigned to it', async () => {
  const result = await ownership({
    requester: user(),
    record: { createdBy: String(oid()), sales: 'Other Person', status: 'Confirmed' },
    rights: { ...ALL_OFF, canEditOthers: true }
  });
  assert.equal(result.nexted, false);
  assert.match(result.body.message, /locked/i);
});

test('ownership: assigned staff may edit a confirmed booking', async () => {
  const me = user();
  const result = await ownership({ requester: me, record: { createdBy: String(oid()), salesId: String(me._id), status: 'Confirmed' } });
  assert.equal(result.nexted, true);
});

// --- protect(): session validation ------------------------------------------------------------------------------

const withStubbedUser = async (found, fn) => {
  const originalUser = UserModel.findById;
  const originalRights = RightModel.find;
  UserModel.findById = () => ({ select: async () => found });
  RightModel.find = () => ({ lean: async () => [] });
  try {
    return await fn();
  } finally {
    UserModel.findById = originalUser;
    RightModel.find = originalRights;
  }
};

const callProtect = async (token) => {
  const res = fakeRes();
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  let nexted = false;
  await protect(req, res, () => (nexted = true));
  return { res, req, nexted };
};

const sign = (id, secret = process.env.JWT_SECRET, options = {}) => jwt.sign({ id }, secret, { expiresIn: '1h', ...options });

test('protect: valid token for an active user passes and loads merged rights', async () => {
  const u = user();
  await withStubbedUser(u, async () => {
    const { nexted, req } = await callProtect(sign(String(u._id)));
    assert.equal(nexted, true);
    assert.equal(req.userRights.guest_list.canRead, true);
  });
});

test('protect: a deleted user is rejected even with a still-valid token', async () => {
  const u = user({ deleted: true });
  await withStubbedUser(u, async () => {
    const { nexted, res } = await callProtect(sign(String(u._id)));
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 401);
  });
});

test('protect: a deactivated user is rejected', async () => {
  const u = user({ active: false });
  await withStubbedUser(u, async () => {
    const { nexted, res } = await callProtect(sign(String(u._id)));
    assert.equal(nexted, false);
    assert.equal(res.statusCode, 401);
  });
});

test('protect: tokens signed with another secret (incl. the old hard-coded one) are rejected', async () => {
  const u = user();
  await withStubbedUser(u, async () => {
    for (const secret of ['seven_heaven_jwt_secret_super_key_2026_luxury_travel', 'something-else']) {
      const { nexted, res } = await callProtect(sign(String(u._id), secret));
      assert.equal(nexted, false, secret);
      assert.equal(res.statusCode, 401, secret);
    }
  });
});

test('protect: expired token, missing token and unsigned (alg none) token are rejected', async () => {
  const u = user();
  await withStubbedUser(u, async () => {
    const expired = sign(String(u._id), process.env.JWT_SECRET, { expiresIn: -10 });
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: String(u._id) })).toString('base64url')}.`;
    for (const token of [expired, none, '']) {
      const { nexted, res } = await callProtect(token);
      assert.equal(nexted, false);
      assert.equal(res.statusCode, 401);
    }
  });
});
