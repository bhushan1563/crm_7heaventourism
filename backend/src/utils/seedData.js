import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';

const modules = ['guest_list', 'supplier_list', 'quotations', 'users', 'rights', 'scanner', 'reports'];

const roleRights = {
  Admin: () => ({
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    canDownload: true,
    canEditOthers: true
  }),
  SuperAdmin: () => ({
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    canDownload: true,
    canEditOthers: true
  }),
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

export const seedDatabase = async () => {
  try {
    const existingUsers = await UserModel.countDocuments();

    if (existingUsers === 0) {
      console.log('[7Heaven Seed] Initializing admin user...');
      await UserModel.create({
        email: 'admin@7heaven.com',
        password: '123456',
        firstName: 'admin',
        lastName: 'admin',
        role: 'SuperAdmin',
        phone: '1234567890',
        active: true,
        deleted: false
      });
    }

    for (const [role, permissionsFor] of Object.entries(roleRights)) {
      for (const mod of modules) {
        const existing = await RightModel.findOne({ userRole: role, module: mod, userId: null });
        if (existing) continue;
        try {
          await RightModel.create({
            userRole: role,
            module: mod,
            userId: null,
            ...permissionsFor(mod)
          });
        } catch (seedErr) {
          console.error(`[7Heaven Seed] Skipped ${role}/${mod}:`, seedErr.message);
        }
      }
    }

    console.log('[7Heaven Seed] Admin and role rights ready.');
  } catch (err) {
    console.error('[7Heaven Seed] Error seeding database:', err);
  }
};

export default seedDatabase;
