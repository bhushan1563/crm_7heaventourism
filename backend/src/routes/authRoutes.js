import express from 'express';
import { login, getMe, updateProfile, changePassword, setAvatar, removeAvatar } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { loginLimiter, passwordLimiter } from '../middleware/rateLimit.js';
import { config } from '../config/env.js';

const router = express.Router();

router.post('/login', ...(config.isProduction ? [loginLimiter] : []), login);
router.get('/me', protect, getMe);

// "My profile": every signed-in user can manage their own details, password and photo (no module right needed).
router.put('/profile', protect, updateProfile);
router.put('/password', protect, passwordLimiter, changePassword);
router.put('/avatar', protect, setAvatar);
router.delete('/avatar', protect, removeAvatar);

export default router;
