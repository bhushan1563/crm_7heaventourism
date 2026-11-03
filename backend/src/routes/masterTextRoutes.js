import express from 'express';
import { getMasterText, resetMasterText, saveMasterText } from '../controllers/masterTextController.js';
import { protect } from '../middleware/auth.js';
import { checkRights } from '../middleware/checkRights.js';

const router = express.Router();

router.use(protect);

// Everyone who makes quotations reads the standard text (a new quotation starts with it); only people who may change rights (the
// Admins) change it, because it is printed on every quotation the company sends.
router.get('/', checkRights('quotations', 'canRead'), getMasterText);
router.put('/', checkRights('rights', 'canUpdate'), saveMasterText);
router.post('/reset', checkRights('rights', 'canUpdate'), resetMasterText);

export default router;
