import express from 'express';
import { createFutureClient, deleteFutureClient, findFutureClient, getCurrentClients, getFutureClients, updateFutureClient } from '../controllers/clientController.js';
import { protect } from '../middleware/auth.js';
import { checkRecordOwnership, checkRights } from '../middleware/checkRights.js';

// Clients belong to the sales side of the business, so they follow the guest list's rights: whoever may read, add, change or delete
// guests may do the same here. A future client can be changed or removed only by whoever added it (or someone allowed to edit others').
const router = express.Router();

router.use(protect);

router.get('/current', checkRights('guest_list', 'canRead'), getCurrentClients);
router.get('/future', checkRights('guest_list', 'canRead'), getFutureClients);
router.post('/future', checkRights('guest_list', 'canCreate'), createFutureClient);
router.put('/future/:id', checkRights('guest_list', 'canUpdate'), checkRecordOwnership(findFutureClient), updateFutureClient);
router.delete('/future/:id', checkRights('guest_list', 'canDelete'), checkRecordOwnership(findFutureClient), deleteFutureClient);

export default router;
