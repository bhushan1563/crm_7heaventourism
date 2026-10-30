import express from 'express';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierStats,
  findSupplierDocument
} from '../controllers/supplierController.js';
import { protect } from '../middleware/auth.js';
import { checkRights, checkRecordOwnership } from '../middleware/checkRights.js';

const router = express.Router();

const findSupplier = (req) => findSupplierDocument(req.params.id);

router.use(protect);

router.get('/stats', checkRights('supplier_list', 'canRead'), getSupplierStats);
router.get('/', checkRights('supplier_list', 'canRead'), getSuppliers);
router.get('/:id', checkRights('supplier_list', 'canRead'), getSupplierById);
router.post('/', checkRights('supplier_list', 'canCreate'), createSupplier);
router.put('/:id', checkRights('supplier_list', 'canUpdate'), checkRecordOwnership(findSupplier), updateSupplier);
router.delete('/:id', checkRights('supplier_list', 'canDelete'), checkRecordOwnership(findSupplier), deleteSupplier);

export default router;
