import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import UserModel from '../models/User.js';
import RightModel from '../models/Right.js';
import { config } from '../config/env.js';
import { friendlyMessage } from '../utils/errors.js';
import { MIN_PASSWORD_LENGTH } from '../utils/security.js';

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
  // protect() does not load the (large) profile photo on every request; this endpoint does.
  const user = await UserModel.findById(req.user._id).select('-password');
  res.json({
    success: true,
    user,
    rights: req.userRights
  });
};

// ---------------------------------------------------------------------------------------------------------------
// My profile: personal details, password and photo of the signed-in user
// ---------------------------------------------------------------------------------------------------------------

const fail = (res, message) => res.status(200).json({ success: false, message });

const NAME_MAX = 50;
const PASSWORD_MAX = 72; // bcrypt ignores everything after 72 bytes, so don't accept what cannot be honoured

export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone = '' } = req.body || {};

    if (typeof firstName !== 'string' || typeof lastName !== 'string' || typeof phone !== 'string') {
      return fail(res, 'First name, last name and phone must be text.');
    }
    if (!firstName.trim() || !lastName.trim()) {
      return fail(res, 'First name and last name are required.');
    }
    if (firstName.trim().length > NAME_MAX || lastName.trim().length > NAME_MAX) {
      return fail(res, `Names can be at most ${NAME_MAX} characters.`);
    }
    if (phone.trim() && !/^[0-9+()\-\s.]{5,20}$/.test(phone.trim())) {
      return fail(res, 'Please enter a valid phone number (digits, +, spaces, dashes).');
    }

    const user = await UserModel.findByIdAndUpdate(
      req.user._id,
      { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ success: true, message: 'Your profile was updated.', user });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to update profile') });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return fail(res, 'Please enter your current password and a new password.');
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return fail(res, `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (newPassword.length > PASSWORD_MAX) {
      return fail(res, `The new password can be at most ${PASSWORD_MAX} characters.`);
    }
    if (newPassword === currentPassword) {
      return fail(res, 'The new password must be different from the current one.');
    }

    const user = await UserModel.findById(req.user._id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return fail(res, 'Your current password is incorrect.');
    }

    user.password = newPassword; // hashed by the model's pre-save hook
    // Every session issued before now (other devices, a stolen token) stops working; this one gets a fresh token below.
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await user.save();

    res.locals.passwordChanged = true; // tells the rate limiter this attempt succeeded
    res.json({ success: true, message: 'Your password was changed. Other devices were signed out.', token: generateToken(user._id) });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to change password') });
  }
};

// Photos are stored on the user document as a small data URL (the browser crops and shrinks them first), so they work
// on a server without a persistent disk (Vercel) and need no extra storage service.
const AVATAR_MAX_CHARS = 150000;
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

// Checks the real file signature, not just the label in the data URL.
const hasImageSignature = (type, bytes) => {
  if (type === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'png') return bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG';
  if (type === 'webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
};

export const setAvatar = async (req, res) => {
  try {
    const { image } = req.body || {};
    if (typeof image !== 'string' || !image) return fail(res, 'Please choose a photo.');
    if (image.length > AVATAR_MAX_CHARS) return fail(res, 'That photo is too large. Please choose a smaller image.');

    const match = AVATAR_PATTERN.exec(image);
    if (!match) return fail(res, 'Only JPG, PNG or WebP photos are allowed.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length < 100 || !hasImageSignature(match[1], bytes)) {
      return fail(res, 'That file is not a valid image.');
    }

    const user = await UserModel.findByIdAndUpdate(req.user._id, { avatar: image }, { new: true }).select('-password');
    res.json({ success: true, message: 'Profile photo updated.', user });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to update photo') });
  }
};

export const removeAvatar = async (req, res) => {
  try {
    const user = await UserModel.findByIdAndUpdate(req.user._id, { avatar: '' }, { new: true }).select('-password');
    res.json({ success: true, message: 'Profile photo removed.', user });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to remove photo') });
  }
};
