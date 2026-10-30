import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';

const MODULES = ['guest_list', 'supplier_list', 'quotations', 'users', 'rights', 'scanner', 'reports'];
const EDITABLE_ROLES = ['Sales', 'Ops', 'Viewer'];

const permissionFlags = (p = {}) => ({
  canCreate: !!p.canCreate,
  canRead: p.canRead !== undefined ? !!p.canRead : true,
  canUpdate: !!p.canUpdate,
  canDelete: !!p.canDelete,
  canDownload: !!p.canDownload,
  canEditOthers: !!p.canEditOthers
});

const saveRight = (rightData) => {
  const payload = { ...rightData };
  if (payload.userId) {
    payload.userId = String(payload.userId);
    return RightModel.findOneAndUpdate(
      { userId: payload.userId, module: payload.module },
      payload,
      { upsert: true, new: true }
    );
  }

  payload.userId = null;
  return RightModel.findOneAndUpdate(
    { userRole: payload.userRole, module: payload.module, userId: null },
    payload,
    { upsert: true, new: true }
  );
};

export const getRights = async (req, res) => {
  try {
    const { userId, userRole } = req.query;
    const filter = {};
    if (userId) {
      filter.userId = userId;
    } else if (userRole) {
      filter.userRole = userRole;
      filter.userId = null;
    }

    const rights = await RightModel.find(filter);
    res.json({
      success: true,
      data: rights
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to fetch rights: ' + error.message });
  }
};

export const getAllRightsMatrix = async (req, res) => {
  try {
    const users = await UserModel.find().select('-password').sort({ createdAt: -1 });
    const allRights = await RightModel.find();
    const modules = MODULES;

    const matrix = users.map(user => {
      const userSpecificRights = allRights.filter(r => String(r.userId) === String(user._id));
      const roleRights = allRights.filter(r => r.userRole === user.role);

      const modulePermissions = {};
      modules.forEach(mod => {
        const uRight = userSpecificRights.find(r => r.module === mod);
        const rRight = roleRights.find(r => r.module === mod);

        if (user.role === 'Admin' || user.role === 'SuperAdmin') {
          modulePermissions[mod] = {
            canCreate: true,
            canRead: true,
            canUpdate: true,
            canDelete: true,
            canDownload: true,
            canEditOthers: true,
          };
        } else if (uRight) {
          modulePermissions[mod] = {
            canCreate: uRight.canCreate,
            canRead: uRight.canRead,
            canUpdate: uRight.canUpdate,
            canDelete: uRight.canDelete,
            canDownload: uRight.canDownload,
            canEditOthers: uRight.canEditOthers,
          };
        } else if (rRight) {
          modulePermissions[mod] = {
            canCreate: rRight.canCreate,
            canRead: rRight.canRead,
            canUpdate: rRight.canUpdate,
            canDelete: rRight.canDelete,
            canDownload: rRight.canDownload,
            canEditOthers: rRight.canEditOthers,
          };
        } else {
          modulePermissions[mod] = {
            canCreate: false,
            canRead: true,
            canUpdate: false,
            canDelete: false,
            canDownload: false,
            canEditOthers: false,
          };
        }
      });

      return {
        user: {
          _id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          active: user.active
        },
        permissions: modulePermissions
      };
    });

    res.json({
      success: true,
      data: matrix
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to build rights matrix: ' + error.message });
  }
};

export const updateRight = async (req, res) => {
  try {
    const { userId, userRole, module, canCreate, canRead, canUpdate, canDelete, canDownload, canEditOthers } = req.body;

    if (!module || (!userId && !userRole)) {
      return res.status(200).json({
        success: false,
        message: 'Please provide module and either userId or userRole.'
      });
    }

    const saved = await saveRight({
      userId: userId || null,
      userRole: userRole || null,
      module,
      canCreate: canCreate !== undefined ? !!canCreate : true,
      canRead: canRead !== undefined ? !!canRead : true,
      canUpdate: canUpdate !== undefined ? !!canUpdate : false,
      canDelete: canDelete !== undefined ? !!canDelete : false,
      canDownload: canDownload !== undefined ? !!canDownload : false,
      canEditOthers: canEditOthers !== undefined ? !!canEditOthers : false
    });

    res.json({
      success: true,
      message: `Rights updated for module '${module}'`,
      data: saved
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to update rights: ' + error.message });
  }
};

export const bulkUpdateUserRights = async (req, res) => {
  try {
    const { userId, userRole, permissions } = req.body;

    if ((!userId && !userRole) || !permissions || typeof permissions !== 'object') {
      return res.status(200).json({ success: false, message: 'permissions and either userId or userRole are required.' });
    }

    if (userRole && !EDITABLE_ROLES.includes(userRole)) {
      return res.status(200).json({
        success: false,
        message: 'Admin access stays unrestricted. Choose Sales, Ops, or Viewer.'
      });
    }

    const modules = Object.keys(permissions).filter((mod) => MODULES.includes(mod));
    if (modules.length === 0) {
      return res.status(200).json({ success: false, message: 'No valid modules were provided.' });
    }

    const results = [];
    for (const mod of modules) {
      const flags = permissionFlags(permissions[mod]);
      const saved = await saveRight({
        ...(userId ? { userId } : { userRole }),
        module: mod,
        ...flags
      });
      results.push(saved);
    }

    let updatedUsers = 0;
    if (userRole) {
      const members = await UserModel.find({ role: userRole, deleted: { $ne: true } }).select('_id');
      for (const member of members) {
        for (const mod of modules) {
          await saveRight({
            userId: member._id,
            module: mod,
            ...permissionFlags(permissions[mod])
          });
        }
      }
      updatedUsers = members.length;
    }

    res.json({
      success: true,
      message: userRole
        ? `Role rights saved for ${userRole}. ${updatedUsers} member${updatedUsers === 1 ? '' : 's'} updated.`
        : 'All permissions saved successfully.',
      updatedUsers,
      data: results
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to bulk update rights: ' + error.message });
  }
};
