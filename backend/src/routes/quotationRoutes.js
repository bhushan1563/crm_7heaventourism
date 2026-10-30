import express from 'express';
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  duplicateQuotation,
  convertFromInquiry,
  getQuotationStats,
  findQuotationDocument
} from '../controllers/quotationController.js';
import { protect } from '../middleware/auth.js';
import { checkRights, checkRecordOwnership } from '../middleware/checkRights.js';

const router = express.Router();

const findQuotation = (req) => findQuotationDocument(req.params.id);

router.use(protect);

router.get('/stats', getQuotationStats);
router.get('/', checkRights('quotations', 'canRead'), getQuotations);
router.get('/:id', checkRights('quotations', 'canRead'), getQuotationById);
router.post('/', checkRights('quotations', 'canCreate'), createQuotation);
router.post('/convert-inquiry', checkRights('quotations', 'canCreate'), convertFromInquiry);
router.post('/:id/duplicate', checkRights('quotations', 'canCreate'), duplicateQuotation);
router.put('/:id', checkRights('quotations', 'canUpdate'), checkRecordOwnership(findQuotation), updateQuotation);
router.delete('/:id', checkRights('quotations', 'canDelete'), checkRecordOwnership(findQuotation), deleteQuotation);

export default router;
