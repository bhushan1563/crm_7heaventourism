import bcrypt from 'bcryptjs';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';
import { isAdminRole, isValidEmail, pick, passwordProblem } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

const ASSIGNABLE_ROLES = ['Admin', 'Sales', 'Ops', 'Viewer'];
const UPDATABLE_FIELDS = ['email', 'firstName', 'lastName', 'phone', 'active', 'role', 'password'];

const fail = (res, message) => res.status(200).json({ success: false, message });

const saveRight = (rightData) => {
  const payload = { ...rightData };
  if (payload.userId) payload.userId = String(payload.userId);
  const filter = payload.userId
    ? { userId: payload.userId, module: payload.module }
    : { userRole: payload.userRole, module: payload.module };
  return RightModel.findOneAndUpdate(filter, payload, { upsert: true, new: true });
};

/**
 * Who may touch whom. Returns an error message, or null when the action is allowed.
 * - Admin accounts can only be managed by an Admin (otherwise anyone with the "users" right could reset an admin's password).
 * - Nobody can deactivate / delete / re-role their own account (prevents locking the last admin out).
 */
const checkTargetAccess = (req, target, { selfRestricted = false } = {}) => {
  const requesterIsAdmin = isAdminRole(req.user.role);
  if (isAdminRole(target.role) && !requesterIsAdmin) {
    return 'Only an Admin can manage Admin accounts.';
  }
  if (target.role === 'SuperAdmin' && req.user.role !== 'SuperAdmin') {
    return 'Only a SuperAdmin can manage a SuperAdmin account.';
  }
  if (selfRestricted && String(target._id) === String(req.user._id)) {
    return 'You cannot do this to your own account.';
  }
  return null;
};

export const getUsers = async (req, res) => {
  try {
    const users = await UserModel.find({ deleted: false, role: { $ne: 'SuperAdmin' } }).select('-password').sort({ createdAt: -1 });
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to fetch users') });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await UserModel.findOne({ _id: req.params.id, deleted: false }).select('-password');
    if (!user) {
      return res.status(200).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(200).json({ success: false, message: 'User not found.' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, active = true, role = 'Sales', phone = '' } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return fail(res, 'Please provide Email, Password, First Name, and Last Name.');
    }
    if (!isValidEmail(email)) {
      return fail(res, 'Please provide a valid email address.');
    }
    const weakPassword = passwordProblem(password, { email });
    if (weakPassword) return fail(res, weakPassword);
    if (typeof firstName !== 'string' || typeof lastName !== 'string') {
      return fail(res, 'First Name and Last Name must be text.');
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return fail(res, `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`);
    }
    if (isAdminRole(role) && !isAdminRole(req.user.role)) {
      return fail(res, 'Only an Admin can create another Admin.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await UserModel.findOne({ email: normalizedEmail, deleted: false }).select('-password');
    if (existing) {
      return fail(res, 'A user with this email address already exists.');
    }

    const created = await UserModel.create({
      email: normalizedEmail,
      password,
      firstName,
      lastName,
      active: active !== false,
      role,
      phone: typeof phone === 'string' ? phone : ''
    });
    const newUser = created.toObject();
    delete newUser.password;

    const modules = ['guest_list', 'supplier_list', 'users', 'rights', 'scanner', 'reports'];
    const roleRights = await RightModel.find({ userRole: role });

    for (const mod of modules) {
      const match = roleRights.find(r => r.module === mod);
      await saveRight({
        userId: newUser._id,
        module: mod,
        canCreate: match ? match.canCreate : false,
        canRead: match ? match.canRead : true,
        canUpdate: match ? match.canUpdate : false,
        canDelete: match ? match.canDelete : false,
        canDownload: match ? match.canDownload : false,
        canEditOthers: match ? match.canEditOthers : false
      });
    }

    res.status(200).json({
      success: true,
      message: 'User created successfully.',
      data: newUser
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to create user') });
  }
};

export const updateUser = async (req, res) => {
  try {
    const existing = await UserModel.findOne({ _id: req.params.id, deleted: false }).select('-password');
    if (!existing) {
      return fail(res, 'User not found.');
    }

    const isSelf = String(existing._id) === String(req.user._id);
    const denied = checkTargetAccess(req, existing);
    if (denied) return fail(res, denied);

    // Allow-list: nothing else (e.g. `deleted`, `_id`, `$set`) can be written through this endpoint.
    const updateData = pick(req.body, UPDATABLE_FIELDS);

    if (updateData.email !== undefined) {
      if (!isValidEmail(updateData.email)) return fail(res, 'Please provide a valid email address.');
      updateData.email = updateData.email.trim().toLowerCase();
      if (updateData.email !== existing.email.toLowerCase()) {
        const duplicate = await UserModel.findOne({ email: updateData.email, deleted: false, _id: { $ne: existing._id } }).select('-password');
        if (duplicate) return fail(res, 'Email is already in use by another user.');
      }
    }

    if (updateData.role !== undefined && updateData.role !== existing.role) {
      if (!ASSIGNABLE_ROLES.includes(updateData.role)) {
        return fail(res, `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`);
      }
      if (isAdminRole(updateData.role) && !isAdminRole(req.user.role)) {
        return fail(res, 'Only an Admin can grant the Admin role.');
      }
      if (isSelf) return fail(res, 'You cannot change your own role.');
    } else {
      delete updateData.role;
    }

    if (updateData.active === false && isSelf) {
      return fail(res, 'You cannot deactivate your own account.');
    }
    if (updateData.active !== undefined) updateData.active = updateData.active !== false;

    if (!updateData.password) delete updateData.password; // blank = keep the current password
    if (updateData.password !== undefined) {
      const weakPassword = passwordProblem(updateData.password, { email: updateData.email ?? existing.email });
      if (weakPassword) return fail(res, weakPassword);
      updateData.password = await bcrypt.hash(updateData.password, 10);
      updateData.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000); // sign the user out everywhere
    }

    const updated = await UserModel.findByIdAndUpdate(existing._id, updateData, { new: true, runValidators: true }).select('-password');

    res.json({
      success: true,
      message: 'User profile updated successfully.',
      data: updated
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to update user') });
  }
};

export const toggleUserActive = async (req, res) => {
  try {
    const existing = await UserModel.findOne({ _id: req.params.id, deleted: false }).select('-password');
    if (!existing) {
      return fail(res, 'User not found.');
    }

    const denied = checkTargetAccess(req, existing, { selfRestricted: true });
    if (denied) return fail(res, denied);

    const updated = await UserModel.findByIdAndUpdate(
      existing._id,
      { active: !existing.active },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: `User status changed to ${updated.active ? 'Active' : 'Inactive'}`,
      data: updated
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error) });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const existing = await UserModel.findOne({ _id: req.params.id, deleted: false }).select('-password');
    if (!existing) {
      return fail(res, 'User not found.');
    }

    const denied = checkTargetAccess(req, existing, { selfRestricted: true });
    if (denied) return fail(res, denied);

    // Soft delete, and deactivate so any token the user still holds stops working immediately.
    await UserModel.findByIdAndUpdate(existing._id, { deleted: true, active: false });

    res.json({
      success: true,
      message: 'User account removed successfully.'
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to delete user') });
  }
};

/**
 * An Admin (or anyone with the update right on Users) sets a new password for someone else, for example when a person has forgotten
 * theirs. The person is signed out on every device and must sign in with the new password. Admin accounts can only be reset by an
 * Admin, and nobody resets their own here (that is "My Profile", which asks for the current password).
 */
export const resetUserPassword = async (req, res) => {
  try {
    const existing = await UserModel.findOne({ _id: req.params.id, deleted: false });
    if (!existing) return fail(res, 'User not found.');
    if (String(existing._id) === String(req.user._id)) return fail(res, 'To change your own password, use My Profile.');
    const denied = checkTargetAccess(req, existing);
    if (denied) return fail(res, denied);

    const newPassword = req.body?.newPassword;
    const weak = passwordProblem(newPassword, { email: existing.email });
    if (weak) return fail(res, weak);
    if (await bcrypt.compare(newPassword, existing.password)) return fail(res, 'The new password must be different from the current one.');

    existing.password = newPassword; // hashed by the model's pre-save hook
    existing.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000); // ends every session issued before now
    await existing.save();
    const name = `${existing.firstName} ${existing.lastName}`.trim() || existing.email;
    res.json({ success: true, message: `Password changed for ${name}. They were signed out on every device and must sign in with the new password.` });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to change the password'));
  }
};
