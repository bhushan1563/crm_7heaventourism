import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';
import { config } from '../config/env.js';

const generateToken = (id) =>
  jwt.sign({ id }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpiresIn });

const publicUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
};

// A real bcrypt hash of a random value. Compared against when the email is unknown, so "no such user"
// and "wrong password" take the same time and can't be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('7heaven-timing-equalizer', 10);

const INVALID_CREDENTIALS = 'Invalid email or password.';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(200).json({ success: false, message: 'Please provide both email and password.' });
    }

    // Reject objects/arrays (`{"$ne": null}`) before they reach the query.
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(200).json({ success: false, message: INVALID_CREDENTIALS });
    }

    const user = await UserModel.findOne({ email: email.trim().toLowerCase(), deleted: false });

    const isMatch = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !isMatch) {
      return res.status(200).json({ success: false, message: INVALID_CREDENTIALS });
    }

    // Only reveal the account state after the password has been proven correct.
    if (!user.active) {
      return res.status(200).json({ success: false, message: 'Your account is deactivated. Contact system administrator.' });
    }

    const token = generateToken(user._id);

    const userId = String(user._id);
    const rights = await RightModel.find({ $or: [{ userId }, { userRole: user.role }] }).lean();

    res.locals.loginSucceeded = true; // tells the login rate limiter this attempt should not count against the user
    res.json({
      success: true,
      token,
      user: publicUser(user),
      rights: {
        userRights: rights.filter((r) => r.userId === userId),
        roleRights: rights.filter((r) => r.userRole === user.role)
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(200).json({ success: false, message: 'Server error during login. Please try again.' });
  }
};

export const getMe = async (req, res) => {
  // protect() already loaded the user (without the password hash) and merged the rights.
  res.json({
    success: true,
    user: req.user,
    rights: req.userRights
  });
};
