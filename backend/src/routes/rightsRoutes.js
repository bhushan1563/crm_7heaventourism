import express from 'express';
import {
  getRights,
  getEffectiveRights,
  getAllRightsMatrix,
  updateRight,
  bulkUpdateUserRights,
  setSenderNumber
} from '../controllers/rightsController.js';
import { protect } from '../middleware/auth.js';
import { checkRights } from '../middleware/checkRights.js';

const router = express.Router();

router.use(protect);

// Reading the matrix exposes every user's email, role and permissions, and writing it grants access to anything,
// so both need the "rights" module's update permission (Admins always have it). Without this check any logged-in
// user, a Viewer included, could give themselves full access.
router.get('/', checkRights('rights', 'canUpdate'), getRights);
router.get('/matrix', checkRights('rights', 'canUpdate'), getAllRightsMatrix);
router.get('/effective', checkRights('rights', 'canUpdate'), getEffectiveRights);
router.post('/', checkRights('rights', 'canUpdate'), updateRight);
router.post('/bulk', checkRights('rights', 'canUpdate'), bulkUpdateUserRights);
// The number a person's messages to clients carry is set here too, so it needs the same right as changing rights.
router.put('/sender-number/:userId', checkRights('rights', 'canUpdate'), setSenderNumber);

export default router;
