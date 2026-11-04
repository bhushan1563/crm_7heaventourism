import express from 'express';
import { getCalendar } from '../controllers/calendarController.js';
import { protect } from '../middleware/auth.js';

// The calendar reads three modules, so it has no single right: the controller leaves out each source the person may not read.
const router = express.Router();

router.use(protect);
router.get('/', getCalendar);

export default router;
