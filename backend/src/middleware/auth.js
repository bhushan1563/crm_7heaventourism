import jwt from 'jsonwebtoken';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';
import { config } from '../config/env.js';
import { isAdminRole } from '../utils/security.js';
import { RIGHT_FLAGS, RIGHT_MODULES, allRights, defaultRightsFor } from '../config/rights.js';

export { RIGHT_MODULES };

const flagsOf = (right) => Object.fromEntries(RIGHT_FLAGS.map((flag) => [flag, Boolean(right[flag])]));

/** Merges rights for a user: Admin = everything, else per-user override > stored role rights > built-in role default. */
export const resolveRights = (user, rights) => {
  const userId = String(user._id);
  const userRights = rights.filter((r) => r.userId === userId);
  const roleRights = rights.filter((r) => r.userRole === user.role && !r.userId); // a row tied to one person is not a role default

  const merged = {};
  for (const mod of RIGHT_MODULES) {
    if (isAdminRole(user.role)) {
      merged[mod] = allRights();
      continue;
    }
    const own = userRights.find((r) => r.module === mod);
    const byRole = roleRights.find((r) => r.module === mod);
    merged[mod] = own ? flagsOf(own) : byRole ? flagsOf(byRole) : defaultRightsFor(user.role, mod);
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

  // A token is only ever issued with a plain id; anything else (an object, a number) is refused before it reaches the database.
  if (typeof decoded.id !== 'string' || !/^[0-9a-f]{24}$/i.test(decoded.id)) {
    return unauthorized(res, 'Invalid or expired session token. Please log in again.');
  }

  try {
    const user = await UserModel.findById(decoded.id).select('-password -avatar');

    if (!user || user.deleted) {
      return unauthorized(res, 'User belonging to this token no longer exists.');
    }

    // A password change (by the user or an admin) ends every session that was issued before it.
    if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      return unauthorized(res, 'Your password was changed. Please sign in again.');
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
