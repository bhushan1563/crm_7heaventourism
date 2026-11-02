import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RIGHT_FLAGS, RIGHT_MODULES } from '../src/config/rights.js';
import { protect } from '../src/middleware/auth.js';

// The rights of every route, read from the real routers. A new route that forgets its guard, or one that asks for the wrong right
// (a GET that needs "delete", a DELETE that only needs "read"), fails here instead of being found in production.

const ROUTERS = {
  auth: () => import('../src/routes/authRoutes.js'),
  guests: () => import('../src/routes/guestRoutes.js'),
  suppliers: () => import('../src/routes/supplierRoutes.js'),
  quotations: () => import('../src/routes/quotationRoutes.js'),
  users: () => import('../src/routes/userRoutes.js'),
  rights: () => import('../src/routes/rightsRoutes.js'),
  scanner: () => import('../src/routes/scannerRoutes.js'),
  media: () => import('../src/routes/mediaRoutes.js'),
  itineraries: () => import('../src/routes/itineraryRoutes.js'),
  hotels: () => import('../src/routes/hotelRoutes.js'),
  visas: () => import('../src/routes/visaRoutes.js'),
  confirmations: () => import('../src/routes/confirmationRoutes.js')
};

// Routes without a rights tag, and why that is right.
const NO_RIGHTS_TAG = {
  'auth POST /login': 'public: this is how people sign in',
  'auth GET /me': 'a person reads their own account',
  'auth PUT /profile': 'a person edits their own account',
  'auth PUT /password': 'a person changes their own password',
  'auth PUT /avatar': 'a person changes their own picture',
  'auth DELETE /avatar': 'a person removes their own picture',
  'media POST /': 'guarded by requireMediaRights: what the photo is for decides the module, and it runs before the file is read (see media.test.js)'
};

// What each kind of request needs. Anything outside this table is a deliberate exception that has to be written down here.
const ALLOWED = { GET: ['canRead'], POST: ['canCreate', 'canUpdate'], PUT: ['canUpdate'], PATCH: ['canUpdate'], DELETE: ['canDelete'] };
const EXCEPTIONS = {
  'rights GET /': 'the rights screen is for people who may change rights; reading it needs the same',
  'rights GET /matrix': 'same',
  'rights GET /effective': 'same',
  'media GET /usage': 'the storage meter is for administrators (rights.canUpdate)'
};

const routesOf = async () => {
  const rows = [];
  for (const [name, load] of Object.entries(ROUTERS)) {
    const router = (await load()).default;
    const protectedByRouter = router.stack.some((layer) => !layer.route && layer.handle === protect);
    for (const layer of router.stack.filter((l) => l.route)) {
      for (const method of Object.keys(layer.route.methods)) {
        const handlers = layer.route.stack.map((s) => s.handle);
        rows.push({
          key: `${name} ${method.toUpperCase()} ${layer.route.path}`,
          router: name,
          method: method.toUpperCase(),
          rights: handlers.map((h) => h.rights).filter(Boolean),
          signedIn: protectedByRouter || handlers.includes(protect)
        });
      }
    }
  }
  return rows;
};

test('every route needs a signed-in user, except signing in', async () => {
  const rows = await routesOf();
  assert.ok(rows.length > 40, `found ${rows.length} routes`);
  for (const row of rows) {
    if (row.key === 'auth POST /login') continue;
    assert.equal(row.signedIn, true, `${row.key} can be called without signing in`);
  }
});

test('every business route is guarded by a right, and the exceptions are written down', async () => {
  for (const row of await routesOf()) {
    if (row.key in NO_RIGHTS_TAG) {
      assert.equal(row.rights.length, 0, `${row.key} is listed as having no rights tag but has one: update NO_RIGHTS_TAG`);
      continue;
    }
    assert.ok(row.rights.length >= 1, `${row.key} has no rights check. Add checkRights(module, action), or list it in NO_RIGHTS_TAG with the reason.`);
  }
});

test('every right names a real module and a real action, in the module the router belongs to', async () => {
  const ownModule = { guests: 'guest_list', suppliers: 'supplier_list', quotations: 'quotations', users: 'users', rights: 'rights', scanner: 'scanner', itineraries: 'itineraries', hotels: 'hotels', visas: 'visas', confirmations: 'confirmations' };
  for (const row of await routesOf()) {
    for (const { moduleName, action } of row.rights) {
      assert.ok(RIGHT_MODULES.includes(moduleName), `${row.key}: "${moduleName}" is not a rights module`);
      assert.ok(RIGHT_FLAGS.includes(action), `${row.key}: "${action}" is not a right`);
    }
    const primary = row.rights[0];
    if (primary && row.router in ownModule && !(row.key in EXCEPTIONS)) {
      assert.equal(primary.moduleName, ownModule[row.router], `${row.key} checks the ${primary.moduleName} module, not ${ownModule[row.router]}`);
    }
  }
});

test('reading needs "read", creating needs "create", changing needs "update", deleting needs "delete"', async () => {
  for (const row of await routesOf()) {
    if (row.key in NO_RIGHTS_TAG || row.key in EXCEPTIONS) continue;
    const primary = row.rights[0];
    assert.ok(ALLOWED[row.method].includes(primary.action), `${row.key} asks for ${primary.action}; a ${row.method} should ask for ${ALLOWED[row.method].join(' or ')}`);
  }
});

test('confirming a booking also needs permission to read quotations (it reads and locks one)', async () => {
  const row = (await routesOf()).find((r) => r.key === 'confirmations POST /');
  const needs = row.rights.map((r) => `${r.moduleName}.${r.action}`);
  assert.ok(needs.includes('confirmations.canCreate') && needs.includes('quotations.canRead'), needs.join(', '));
});

test('nothing can be deleted by a right other than "delete", and bookings cannot be deleted at all', async () => {
  const rows = await routesOf();
  assert.deepEqual(rows.filter((r) => r.method === 'DELETE' && r.rights.some((x) => x.action !== 'canDelete')).map((r) => r.key), []);
  assert.deepEqual(rows.filter((r) => r.router === 'confirmations' && r.method === 'DELETE').map((r) => r.key), [], 'bookings are cancelled, never deleted');
});
