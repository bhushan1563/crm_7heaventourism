import jwt from 'jsonwebtoken';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';

export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(200).json({ success: false, message: 'Not authorized to access this route, token missing.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seven_heaven_jwt_secret_super_key_2026_luxury_travel');
    const user = await UserModel.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(200).json({ success: false, message: 'User belonging to this token no longer exists.' });
    }

    if (!user.active) {
      return res.status(200).json({ success: false, message: 'User account has been deactivated. Please contact your administrator.' });
    }

    // Fetch user specific rights or role rights
    const userRights = await RightModel.find({ userId: String(user._id) });
    const roleRights = await RightModel.find({ userRole: user.role });
    
    // Merge rights (user specific overrides role)
    const mergedRights = {};
    const modules = ['guest_list', 'supplier_list', 'quotations', 'users', 'rights', 'scanner', 'reports'];
    
    modules.forEach(mod => {
      const uRight = userRights.find(r => r.module === mod);
      const rRight = roleRights.find(r => r.module === mod);
      
      if (user.role === 'Admin' || user.role === 'SuperAdmin') {
        mergedRights[mod] = {
          canCreate: true,
          canRead: true,
          canUpdate: true,
          canDelete: true,
          canDownload: true,
          canEditOthers: true
        };
      } else if (uRight) {
        mergedRights[mod] = {
          canCreate: uRight.canCreate,
          canRead: uRight.canRead,
          canUpdate: uRight.canUpdate,
          canDelete: uRight.canDelete,
          canDownload: uRight.canDownload,
          canEditOthers: uRight.canEditOthers
        };
      } else if (rRight) {
        mergedRights[mod] = {
          canCreate: rRight.canCreate,
          canRead: rRight.canRead,
          canUpdate: rRight.canUpdate,
          canDelete: rRight.canDelete,
          canDownload: rRight.canDownload,
          canEditOthers: rRight.canEditOthers
        };
      } else {
        mergedRights[mod] = {
          canCreate: false,
          canRead: true, // "All data can be seen by any user"
          canUpdate: false,
          canDelete: false,
          canDownload: false,
          canEditOthers: false
        };
      }
    });

    req.user = user;
    req.userRights = mergedRights;
    next();
  } catch (err) {
    return res.status(200).json({ success: false, message: 'Invalid or expired session token. Please log in again.' });
  }
};
