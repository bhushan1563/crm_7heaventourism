import bcrypt from 'bcryptjs';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';

const saveRight = (rightData) => {
  const payload = { ...rightData };
  if (payload.userId) payload.userId = String(payload.userId);
  const filter = payload.userId
    ? { userId: payload.userId, module: payload.module }
    : { userRole: payload.userRole, module: payload.module };
  return RightModel.findOneAndUpdate(filter, payload, { upsert: true, new: true });
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
    res.status(200).json({ success: false, message: 'Failed to fetch users: ' + error.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(200).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, active = true, role = 'Sales', phone = '' } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(200).json({
        success: false,
        message: 'Please provide Email, Password, First Name, and Last Name.'
      });
    }

    const existing = await UserModel.findOne({ email: email.trim().toLowerCase(), deleted: false }).select('-password');
    if (existing) {
      return res.status(200).json({
        success: false,
        message: 'A user with this email address already exists.'
      });
    }

    const created = await UserModel.create({
      email,
      password,
      firstName,
      lastName,
      active: active !== undefined ? active : true,
      role,
      phone
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
    res.status(200).json({ success: false, message: 'Failed to create user: ' + error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const existing = await UserModel.findById(userId).select('-password');
    if (!existing) {
      return res.status(200).json({ success: false, message: 'User not found.' });
    }

    const updateData = { ...req.body };
    if (updateData.email && updateData.email.toLowerCase() !== existing.email.toLowerCase()) {
      const duplicate = await UserModel.findOne({ email: updateData.email.trim().toLowerCase(), deleted: false }).select('-password');
      if (duplicate) {
        return res.status(200).json({ success: false, message: 'Email is already in use by another user.' });
      }
    }

    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    const updated = await UserModel.findByIdAndUpdate(existing._id, updateData, { new: true }).select('-password');

    res.json({
      success: true,
      message: 'User profile updated successfully.',
      data: updated
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to update user: ' + error.message });
  }
};

export const toggleUserActive = async (req, res) => {
  try {
    const userId = req.params.id;
    const existing = await UserModel.findById(userId).select('-password');
    if (!existing) {
      return res.status(200).json({ success: false, message: 'User not found.' });
    }

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
    res.status(200).json({ success: false, message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const existing = await UserModel.findById(userId).select('-password');
    if (!existing) {
      return res.status(200).json({ success: false, message: 'User not found.' });
    }

    await UserModel.findByIdAndUpdate(existing._id, { deleted: true });

    res.json({
      success: true,
      message: 'User account removed successfully.'
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to delete user: ' + error.message });
  }
};
