import express from 'express';
import { createManual, deleteManual, getCalendar } from '../controllers/calendarController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.get('/', getCalendar);
router.post('/manual', createManual);
router.delete('/manual/:id', deleteManual);

export default router;
