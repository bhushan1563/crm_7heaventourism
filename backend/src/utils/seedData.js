import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';
import { config } from '../config/env.js';

const modules = ['guest_list', 'supplier_list', 'quotations', 'users', 'rights', 'scanner', 'reports'];

// Admin / SuperAdmin are not listed: they bypass rights checks in code and the Right schema has no SuperAdmin role.
const roleRights = {
  Sales: (mod) => ({
    canCreate: mod === 'guest_list' || mod === 'scanner' || mod === 'quotations',
    canRead: true,
    canUpdate: mod === 'guest_list' || mod === 'quotations',
    canDelete: false,
    canDownload: mod === 'quotations',
    canEditOthers: false
  }),
  Ops: (mod) => ({
    canCreate: mod === 'guest_list' || mod === 'supplier_list' || mod === 'quotations',
    canRead: true,
    canUpdate: mod === 'guest_list' || mod === 'supplier_list' || mod === 'quotations',
    canDelete: false,
    canDownload: true,
    canEditOthers: false
  }),
  Viewer: () => ({
    canCreate: false,
    canRead: true,
    canUpdate: false,
    canDelete: false,
    canDownload: false,
    canEditOthers: false
  })
};

/**
 * Optional first-run bootstrap. There is deliberately no built-in default login: on an empty database an Admin is
 * created only when ADMIN_EMAIL and ADMIN_PASSWORD are set (or via `npm run create-admin`).
 */
const bootstrapAdmin = async () => {
  if (!config.adminEmail || !config.adminPassword) return;
  if ((await UserModel.estimatedDocumentCount()) > 0) return;

  await UserModel.create({
    email: config.adminEmail,
    password: config.adminPassword,
    firstName: 'Admin',
    lastName: 'User',
    role: 'Admin',
    phone: '',
    active: true,
    deleted: false
  });
  console.log(`[7Heaven Seed] Created initial Admin ${config.adminEmail}. Remove ADMIN_EMAIL / ADMIN_PASSWORD from the environment now.`);
};

/** Inserts any missing default role rights in one round trip; existing (customised) rights are never overwritten. */
const ensureRoleRights = async () => {
  const now = new Date();
  const operations = [];
  for (const [role, permissionsFor] of Object.entries(roleRights)) {
    for (const mod of modules) {
      operations.push({
        updateOne: {
          filter: { userRole: role, module: mod, userId: null },
          // The filter's equality fields (role, module, userId: null) are copied into the inserted document by the upsert.
          update: { $setOnInsert: { ...permissionsFor(mod), createdAt: now, updatedAt: now } },
          upsert: true
        }
      });
    }
  }
  // timestamps: false so existing documents are left completely untouched on every cold start.
  await RightModel.bulkWrite(operations, { ordered: false, timestamps: false });
};

export const seedDatabase = async () => {
  try {
    await bootstrapAdmin();
    await ensureRoleRights();
  } catch (err) {
    console.error('[7Heaven Seed] Error seeding database:', err.message);
  }
};

export default seedDatabase;
