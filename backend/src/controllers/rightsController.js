import mongoose from 'mongoose';
import UserModel from '../models/User.js';
import { resolveRights } from '../middleware/auth.js';
import RightModel from '../models/Right.js';
import { queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';
import { normalizeSenderNumber } from '../utils/senderNumber.js';
import { RIGHT_MODULES as MODULES, allRights, defaultRightsFor } from '../config/rights.js';

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
    const userId = queryString(req.query.userId);
    const userRole = queryString(req.query.userRole);
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
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to fetch rights') });
  }
};

/**
 * What a person (or a whole role) can really do right now: their own rights, else their role's, else the built-in default. This is
 * the rule the API applies on every request, so the Rights screen can show it (a screen that listed only the stored rows would
 * draw "off" for everything nobody has saved yet, and saving would then take that access away).
 */
export const getEffectiveRights = async (req, res) => {
  try {
    const userId = queryString(req.query.userId);
    const userRole = queryString(req.query.userRole);
    let subject;
    let rows;
    if (userId) {
      if (!mongoose.isValidObjectId(userId)) return res.status(200).json({ success: false, message: 'Person not found.' });
      const user = await UserModel.findOne({ _id: userId, deleted: { $ne: true } }).select('role');
      if (!user) return res.status(200).json({ success: false, message: 'Person not found.' });
      subject = { _id: String(user._id), role: user.role };
      rows = await RightModel.find({ $or: [{ userId: String(user._id) }, { userRole: user.role, userId: null }] }).lean();
    } else if (EDITABLE_ROLES.includes(userRole)) {
      subject = { _id: '', role: userRole };
      rows = await RightModel.find({ userRole, userId: null }).lean();
    } else {
      return res.status(200).json({ success: false, message: 'Please choose a person, or a role (Sales, Ops or Viewer).' });
    }
    res.json({ success: true, data: resolveRights(subject, rows) });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to load the rights') });
  }
};

export const getAllRightsMatrix = async (req, res) => {
  try {
    const users = await UserModel.find({ deleted: { $ne: true } }).select('-password').sort({ createdAt: -1 });
    const storedRights = await RightModel.find();
    const modules = MODULES;

    const matrix = users.map(user => {
      const userSpecificRights = storedRights.filter(r => String(r.userId) === String(user._id));
      const roleRights = storedRights.filter(r => r.userRole === user.role && !r.userId); // a role row never belongs to one person

      const modulePermissions = {};
      modules.forEach(mod => {
        const uRight = userSpecificRights.find(r => r.module === mod);
        const rRight = roleRights.find(r => r.module === mod);

        if (user.role === 'Admin' || user.role === 'SuperAdmin') {
          modulePermissions[mod] = allRights();
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
          modulePermissions[mod] = defaultRightsFor(user.role, mod);
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
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to build rights matrix') });
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

    // Upserts skip schema validation, so check the identifiers here (and keep objects out of the query).
    if (userId && userRole) {
      return res.status(200).json({ success: false, message: 'Choose either a person or a role, not both.' });
    }
    if (!MODULES.includes(module) || (userId && typeof userId !== 'string') || (userRole && !EDITABLE_ROLES.includes(userRole))) {
      return res.status(200).json({ success: false, message: 'Invalid module, user or role.' });
    }

    const saved = await saveRight({
      userId: userId || null,
      userRole: userRole || null,
      module,
      canCreate: canCreate !== undefined ? !!canCreate : false,
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
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to update rights') });
  }
};

export const bulkUpdateUserRights = async (req, res) => {
  try {
    const { userId, userRole, permissions } = req.body;

    if ((!userId && !userRole) || !permissions || typeof permissions !== 'object') {
      return res.status(200).json({ success: false, message: 'permissions and either userId or userRole are required.' });
    }

    if (userId && typeof userId !== 'string') {
      return res.status(200).json({ success: false, message: 'Invalid user.' });
    }

    if (userRole && !EDITABLE_ROLES.includes(userRole)) {
      return res.status(200).json({
        success: false,
        message: 'Admin access stays unrestricted. Choose Sales, Ops, or Viewer.'
      });
    }

    if (userId && userRole) {
      return res.status(200).json({ success: false, message: 'Choose either a person or a role, not both.' });
    }
    const modules = Object.keys(permissions).filter((mod) => MODULES.includes(mod));
    const malformed = modules.find((mod) => permissions[mod] === null || typeof permissions[mod] !== 'object' || Array.isArray(permissions[mod]));
    if (malformed) {
      return res.status(200).json({ success: false, message: `The permissions for '${malformed}' are not valid. Nothing was saved.` });
    }
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
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to bulk update rights') });
  }
};

/**
 * Sets (or clears) the sender number of one person: the number their messages to clients carry. It is part of Rights & Security, so it
 * needs the same right as changing rights (an Admin always has it). A number that cannot be right is refused in plain words.
 */
export const setSenderNumber = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(200).json({ success: false, message: 'That person could not be found.' });
    // Removing the number is done by sending it empty; a request that does not mention it at all must never remove it.
    if (!req.body || Array.isArray(req.body) || !Object.prototype.hasOwnProperty.call(req.body, 'senderNumber')) {
      return res.status(200).json({ success: false, message: 'Please send the sender number (send it empty to remove it).' });
    }
    const number = normalizeSenderNumber(req.body.senderNumber);
    if (!number.ok) return res.status(200).json({ success: false, message: number.message });
    const user = await UserModel.findOneAndUpdate({ _id: userId, deleted: false }, { senderNumber: number.value }, { new: true }).select('firstName lastName senderNumber');
    if (!user) return res.status(200).json({ success: false, message: 'That person could not be found.' });
    const name = `${user.firstName} ${user.lastName}`.trim();
    res.json({
      success: true,
      message: number.value ? `The sender number of ${name} is now ${number.value}.` : `The sender number of ${name} was removed. Their messages will carry the company number.`,
      data: { _id: user._id, senderNumber: user.senderNumber }
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to save the sender number') });
  }
};
