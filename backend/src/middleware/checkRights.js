import { friendlyMessage } from '../utils/errors.js';

export const checkRights = (moduleName, action) => {
  const middleware = (req, res, next) => {
    // Admin bypasses all checks
    if (req.user && (req.user.role === 'Admin' || req.user.role === 'SuperAdmin')) {
      return next();
    }

    const rights = req.userRights && req.userRights[moduleName];
    if (!rights) {
      return res.status(200).json({
        success: false,
        message: `Access Denied: You do not have permissions for the ${moduleName} module.`
      });
    }

    // Check specific action (canRead, canCreate, canUpdate, canDelete, canDownload)
    if (action && !rights[action]) {
      let actionLabel = action.replace('can', '');
      if (action === 'canDownload') actionLabel = 'Download / Export';
      if (action === 'canEditOthers') actionLabel = 'Modify records created by other members';
      
      return res.status(200).json({
        success: false,
        message: `Permission Denied: You do not have '${actionLabel}' rights for ${moduleName.replace('_', ' ')}.`
      });
    }

    next();
  };
  // The module and action are kept on the middleware so a test can read the rights of every route straight from the routers.
  middleware.rights = { moduleName, action };
  return middleware;
};

export const checkRecordOwnership = (recordFinder) => {
  return async (req, res, next) => {
    if (req.user && (req.user.role === 'Admin' || req.user.role === 'SuperAdmin')) {
      return next();
    }

    let moduleName = 'guest_list';
    if (req.baseUrl.includes('guests')) moduleName = 'guest_list';
    else if (req.baseUrl.includes('suppliers')) moduleName = 'supplier_list';
    else if (req.baseUrl.includes('quotations')) moduleName = 'quotations';
    else if (req.baseUrl.includes('hotels') || req.baseUrl.includes('hotel-finder')) moduleName = 'hotels';
    else if (req.baseUrl.includes('visas')) moduleName = 'visas';
    else if (req.baseUrl.includes('itineraries')) moduleName = 'itineraries';
    else if (req.baseUrl.includes('confirmations')) moduleName = 'confirmations';
    const rights = req.userRights && req.userRights[moduleName];

    try {
      const record = await recordFinder(req);
      if (!record) {
        return res.status(200).json({ success: false, message: 'Record not found' });
      }

      // Check if user is creator or assigned sales/ops.
      // Ids are stored as strings on records but req.user._id is an ObjectId, so compare as strings.
      const userId = String(req.user._id);
      const isCreator = record.createdBy === userId || record.createdBy === req.user.email;
      const userFullName = `${req.user.firstName} ${req.user.lastName}`.trim().toLowerCase();
      const isAssignedSales = record.salesId === userId || (record.sales && record.sales.trim().toLowerCase() === userFullName);
      const isAssignedOps = record.opsId === userId || (record.ops && record.ops.trim().toLowerCase() === userFullName);
      const isAssignedStaff = isCreator || isAssignedSales || isAssignedOps;

      const isConfirmed = record.status === 'Confirmed' || record.status === 'Confirmed & Payment received' || record.isLocked === true;

      // If confirmed booking, lock for specific staff only (Admin already bypassed above)
      if (isConfirmed && !isAssignedStaff) {
        return res.status(200).json({
          success: false,
          message: 'Security Restriction: Confirmed bookings are locked and can only be modified by assigned Sales/Ops staff or Master Admin.'
        });
      }

      // If user has canEditOthers right and record is not a locked confirmed booking, allow edit
      if (rights && rights.canEditOthers) {
        return next();
      }

      if (!isAssignedStaff) {
        return res.status(200).json({
          success: false,
          message: 'Access Restricted: You are not authorized to modify or delete data updated by other members.'
        });
      }

      req.targetRecord = record;
      next();
    } catch (err) {
      return res.status(200).json({ success: false, message: friendlyMessage(err, 'Error verifying record ownership') });
    }
  };
};
