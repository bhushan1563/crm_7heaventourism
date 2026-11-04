import express from 'express';
import { cancelConfirmation, createConfirmation, deleteConfirmation, findConfirmationDocument, findQuotationToConfirm, getConfirmationById, getConfirmations, updateConfirmation } from '../controllers/confirmationController.js';
import { protect } from '../middleware/auth.js';
import { checkRecordOwnership, checkRights } from '../middleware/checkRights.js';

const router = express.Router();
const findConfirmation = (req) => findConfirmationDocument(req.params.id);

router.use(protect);

router.get('/', checkRights('confirmations', 'canRead'), getConfirmations);
router.get('/:id', checkRights('confirmations', 'canRead'), getConfirmationById);
// Confirming is checked against the quotation being confirmed: only the people assigned to it (or someone allowed to edit others') may.
// It reads the quotation and locks it, so reading quotations is needed too.
router.post('/', checkRights('confirmations', 'canCreate'), checkRights('quotations', 'canRead'), checkRecordOwnership(findQuotationToConfirm), createConfirmation);
router.put('/:id', checkRights('confirmations', 'canUpdate'), checkRecordOwnership(findConfirmation), updateConfirmation);
router.post('/:id/cancel', checkRights('confirmations', 'canUpdate'), checkRecordOwnership(findConfirmation), cancelConfirmation);
router.delete('/:id', checkRights('confirmations', 'canDelete'), checkRecordOwnership(findConfirmation), deleteConfirmation);

export default router;
