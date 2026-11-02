import express from 'express';
import { createVisa, deleteVisa, findVisaDocument, getVisaById, getVisas, updateVisa } from '../controllers/visaController.js';
import { protect } from '../middleware/auth.js';
import { checkRecordOwnership, checkRights } from '../middleware/checkRights.js';

const router = express.Router();
const findVisa = (req) => findVisaDocument(req.params.id);

router.use(protect);

router.get('/', checkRights('visas', 'canRead'), getVisas);
router.get('/:id', checkRights('visas', 'canRead'), getVisaById);
router.post('/', checkRights('visas', 'canCreate'), createVisa);
router.put('/:id', checkRights('visas', 'canUpdate'), checkRecordOwnership(findVisa), updateVisa);
router.delete('/:id', checkRights('visas', 'canDelete'), checkRecordOwnership(findVisa), deleteVisa);

export default router;
