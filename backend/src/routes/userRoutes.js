import express from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserActive,
  resetUserPassword,
  deleteUser
} from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { checkRights } from '../middleware/checkRights.js';

const router = express.Router();

router.use(protect);

router.get('/', checkRights('users', 'canRead'), getUsers);
router.get('/:id', checkRights('users', 'canRead'), getUserById);
router.post('/', checkRights('users', 'canCreate'), createUser);
router.put('/:id', checkRights('users', 'canUpdate'), updateUser);
router.post('/:id/reset-password', checkRights('users', 'canUpdate'), resetUserPassword);
router.patch('/:id/toggle-active', checkRights('users', 'canUpdate'), toggleUserActive);
router.delete('/:id', checkRights('users', 'canDelete'), deleteUser);

export default router;
