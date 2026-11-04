import express from 'express';
import { login, getMe, updateProfile, changePassword, setAvatar, removeAvatar } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { loginLimiter, passwordLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Skip the rate-limiter only in explicit local development (NODE_ENV=development), so tests and production still enforce it.
const applyLoginLimiter = process.env.NODE_ENV !== 'development';
router.post('/login', ...(applyLoginLimiter ? [loginLimiter] : []), login);
router.get('/me', protect, getMe);

// "My profile": every signed-in user can manage their own details, password and photo (no module right needed).
router.put('/profile', protect, updateProfile);
router.put('/password', protect, passwordLimiter, changePassword);
router.put('/avatar', protect, setAvatar);
router.delete('/avatar', protect, removeAvatar);

export default router;
