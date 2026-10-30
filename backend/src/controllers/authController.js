import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'seven_heaven_jwt_secret_super_key_2026_luxury_travel', {
    expiresIn: '7d'
  });
};

const publicUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(200).json({ success: false, message: 'Please provide both email and password.' });
    }

    const user = await UserModel.findOne({ email: email.trim().toLowerCase() ,deleted: false});

    if (!user) {
      return res.status(200).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    if (!user.active) {
      return res.status(200).json({ success: false, message: 'Your account is deactivated. Contact system administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(200).json({ success: false, message: 'Invalid credentials. Password incorrect.' });
    }

    const token = generateToken(user._id);

    const userRights = await RightModel.find({ userId: String(user._id) });
    const roleRights = await RightModel.find({ userRole: user.role });

    res.json({
      success: true,
      token,
      user: publicUser(user),
      rights: {
        userRights,
        roleRights
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(200).json({ success: false, message: 'Server error during login: ' + error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(200).json({ success: false, message: 'User not found' });
    }
    res.json({
      success: true,
      user,
      rights: req.userRights
    });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message });
  }
};
