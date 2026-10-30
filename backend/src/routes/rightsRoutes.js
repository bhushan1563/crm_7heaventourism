import express from 'express';
import {
  getRights,
  getAllRightsMatrix,
  updateRight,
  bulkUpdateUserRights
} from '../controllers/rightsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getRights);
router.get('/matrix', getAllRightsMatrix);
router.post('/', updateRight);
router.post('/bulk', bulkUpdateUserRights);

export default router;
