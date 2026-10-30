import express from 'express';
import {
  getGuests,
  getGuestById,
  createGuest,
  updateGuest,
  updateGuestStatus,
  addGuestFollowUp,
  deleteGuest,
  getGuestStats,
  findGuestDocument
} from '../controllers/guestController.js';
import { protect } from '../middleware/auth.js';
import { checkRights, checkRecordOwnership } from '../middleware/checkRights.js';

const router = express.Router();

const findGuest = (req) => findGuestDocument(req.params.id);

router.use(protect);

router.get('/stats', getGuestStats);
router.get('/', checkRights('guest_list', 'canRead'), getGuests);
router.get('/:id', checkRights('guest_list', 'canRead'), getGuestById);
router.post('/', checkRights('guest_list', 'canCreate'), createGuest);
router.post('/:id/follow-up', checkRights('guest_list', 'canUpdate'), checkRecordOwnership(findGuest), addGuestFollowUp);
router.put('/:id', checkRights('guest_list', 'canUpdate'), checkRecordOwnership(findGuest), updateGuest);
router.patch('/:id/status', checkRights('guest_list', 'canUpdate'), checkRecordOwnership(findGuest), updateGuestStatus);
router.delete('/:id', checkRights('guest_list', 'canDelete'), checkRecordOwnership(findGuest), deleteGuest);

export default router;
