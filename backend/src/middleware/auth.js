import jwt from 'jsonwebtoken';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';
import { config } from '../config/env.js';
import { isAdminRole } from '../utils/security.js';

export const RIGHT_MODULES = ['guest_list', 'supplier_list', 'quotations', 'users', 'rights', 'scanner', 'reports'];

const FLAGS = ['canCreate', 'canRead', 'canUpdate', 'canDelete', 'canDownload', 'canEditOthers'];

const allowAll = () => Object.fromEntries(FLAGS.map((flag) => [flag, true]));

// Fallback when a module has no stored rights: "All data can be seen by any user", nothing else.
const readOnly = () => Object.fromEntries(FLAGS.map((flag) => [flag, flag === 'canRead']));

const flagsOf = (right) => Object.fromEntries(FLAGS.map((flag) => [flag, Boolean(right[flag])]));

/** Merges rights for a user: Admin = everything, else per-user override > role default > read-only. */
export const resolveRights = (user, rights) => {
  const userId = String(user._id);
  const userRights = rights.filter((r) => r.userId === userId);
  const roleRights = rights.filter((r) => r.userRole === user.role);

  const merged = {};
  for (const mod of RIGHT_MODULES) {
    if (isAdminRole(user.role)) {
      merged[mod] = allowAll();
      continue;
    }
    const own = userRights.find((r) => r.module === mod);
    const byRole = roleRights.find((r) => r.module === mod);
    merged[mod] = own ? flagsOf(own) : byRole ? flagsOf(byRole) : readOnly();
  }
  return merged;
};

// Auth failures use a real 401 so the web app's interceptor signs the user out when a session expires.
const unauthorized = (res, message) => res.status(401).json({ success: false, message });

export const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return unauthorized(res, 'Not authorized to access this route, token missing.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return unauthorized(res, 'Invalid or expired session token. Please log in again.');
  }

  try {
    const user = await UserModel.findById(decoded.id).select('-password');

    if (!user || user.deleted) {
      return unauthorized(res, 'User belonging to this token no longer exists.');
    }

    if (!user.active) {
      return unauthorized(res, 'User account has been deactivated. Please contact your administrator.');
    }

    const rights = await RightModel.find({
      $or: [{ userId: String(user._id) }, { userRole: user.role }]
    }).lean();

    req.user = user;
    req.userRights = resolveRights(user, rights);
    next();
  } catch (err) {
    next(err);
  }
};
