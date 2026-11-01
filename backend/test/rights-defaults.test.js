import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { RIGHT_FLAGS, RIGHT_MODULES, defaultRightsFor, allRights } from '../src/config/rights.js';
import { resolveRights } from '../src/middleware/auth.js';
import RightModel from '../src/models/Right.js';

const user = (role, id = '507f1f77bcf86cd799439011') => ({ _id: id, role });
const stored = (over) => ({ userId: null, userRole: null, module: 'hotels', ...Object.fromEntries(RIGHT_FLAGS.map((f) => [f, false])), ...over });

test('the module list has no duplicates and includes the new modules', () => {
  assert.equal(new Set(RIGHT_MODULES).size, RIGHT_MODULES.length);
  for (const m of ['guest_list', 'supplier_list', 'quotations', 'hotels', 'itineraries', 'confirmations', 'users', 'rights', 'scanner', 'reports']) {
    assert.ok(RIGHT_MODULES.includes(m), m);
  }
});

test('the Right model accepts exactly the shared module list (no second copy to forget)', () => {
  assert.deepEqual([...RightModel.schema.path('module').enumValues].sort(), [...RIGHT_MODULES].sort());
});

test('Sales and Ops can work on the hotel list and itineraries out of the box, but never delete', () => {
  for (const role of ['Sales', 'Ops']) {
    for (const mod of ['hotels', 'itineraries']) {
      const r = defaultRightsFor(role, mod);
      assert.equal(r.canRead && r.canCreate && r.canUpdate && r.canEditOthers, true, `${role}/${mod}`);
      assert.equal(r.canDelete, false, `${role}/${mod} delete`);
    }
  }
  assert.equal(defaultRightsFor('Sales', 'itineraries').canDownload, true, 'itinerary export');
  assert.equal(defaultRightsFor('Sales', 'hotels').canDownload, false, 'hotel list export stays restricted');
});

test('Sales and Ops can confirm bookings, edit them and export them out of the box, but never delete', () => {
  for (const role of ['Sales', 'Ops']) {
    const r = defaultRightsFor(role, 'confirmations');
    assert.equal(r.canRead && r.canCreate && r.canUpdate && r.canEditOthers && r.canDownload, true, role);
    assert.equal(r.canDelete, false, `${role} delete`);
  }
});

test('Viewer and every other module keep the old behaviour: read only', () => {
  for (const mod of RIGHT_MODULES) {
    const viewer = defaultRightsFor('Viewer', mod);
    assert.deepEqual(Object.entries(viewer).filter(([, v]) => v).map(([k]) => k), ['canRead'], `Viewer/${mod}`);
  }
  for (const mod of ['guest_list', 'supplier_list', 'quotations', 'users', 'rights', 'scanner', 'reports']) {
    const sales = defaultRightsFor('Sales', mod);
    assert.deepEqual(Object.entries(sales).filter(([, v]) => v).map(([k]) => k), ['canRead'], `Sales/${mod}`);
  }
});

test('resolveRights: Admin gets everything; a stored role right beats the built-in default; a per-user right beats both', () => {
  const admin = resolveRights(user('Admin'), []);
  assert.ok(RIGHT_MODULES.every((m) => RIGHT_FLAGS.every((f) => admin[m][f] === true)));

  const sales = resolveRights(user('Sales'), []);
  assert.equal(sales.hotels.canCreate, true);

  const restricted = resolveRights(user('Sales'), [stored({ userRole: 'Sales', canRead: true })]);
  assert.equal(restricted.hotels.canCreate, false, 'admin restricted the role');

  const override = resolveRights(user('Sales'), [
    stored({ userRole: 'Sales', canRead: true }),
    stored({ userId: '507f1f77bcf86cd799439011', canRead: true, canDelete: true })
  ]);
  assert.equal(override.hotels.canDelete, true, 'per-user right wins');
});

test('property: resolveRights always returns a boolean for every module and flag, and never throws', () => {
  const role = fc.constantFrom('Admin', 'SuperAdmin', 'Sales', 'Ops', 'Viewer');
  const bool = fc.boolean();
  const right = fc.record({
    userId: fc.option(fc.constantFrom('507f1f77bcf86cd799439011', 'someone-else'), { nil: null }),
    userRole: fc.option(fc.constantFrom('Sales', 'Ops', 'Viewer'), { nil: null }),
    module: fc.constantFrom(...RIGHT_MODULES, 'not_a_module'),
    canCreate: bool, canRead: bool, canUpdate: bool, canDelete: bool, canDownload: bool, canEditOthers: bool
  });
  fc.assert(
    fc.property(role, fc.array(right, { maxLength: 30 }), (r, rights) => {
      const out = resolveRights(user(r), rights);
      assert.deepEqual(Object.keys(out).sort(), [...RIGHT_MODULES].sort());
      for (const mod of RIGHT_MODULES) {
        assert.deepEqual(Object.keys(out[mod]).sort(), [...RIGHT_FLAGS].sort());
        for (const flag of RIGHT_FLAGS) assert.equal(typeof out[mod][flag], 'boolean');
      }
      if (r === 'Admin' || r === 'SuperAdmin') {
        assert.ok(RIGHT_MODULES.every((m) => RIGHT_FLAGS.every((f) => out[m][f] === true)));
      }
    }),
    { numRuns: 500 }
  );
});

test('property: nobody except an Admin ever receives delete by default', () => {
  fc.assert(
    fc.property(fc.constantFrom('Sales', 'Ops', 'Viewer'), fc.constantFrom(...RIGHT_MODULES), (role, mod) => {
      assert.equal(defaultRightsFor(role, mod).canDelete, false);
      assert.equal(allRights().canDelete, true);
    })
  );
});
