import express from 'express';
import { createSaved, deleteSaved, find, findSavedDocument, findText, getSaved, listSaved, markAdded, updateSaved } from '../controllers/hotelFinderController.js';
import { protect } from '../middleware/auth.js';
import { checkRecordOwnership, checkRights } from '../middleware/checkRights.js';
import { finderLimiter } from '../middleware/rateLimit.js';

// The hotel finder belongs to the hotel list, so it uses the hotels rights: finding and saving need "create", looking needs "read",
// editing "update", removing "delete".
const router = express.Router();
const findSaved = (req) => findSavedDocument(req.params.id);

router.use(protect);

router.post('/find', checkRights('hotels', 'canCreate'), finderLimiter, find);
router.post('/find-text', checkRights('hotels', 'canCreate'), finderLimiter, findText);

router.get('/saved', checkRights('hotels', 'canRead'), listSaved);
router.get('/saved/:id', checkRights('hotels', 'canRead'), getSaved);
router.post('/saved', checkRights('hotels', 'canCreate'), createSaved);
router.post('/saved/:id/added', checkRights('hotels', 'canCreate'), markAdded);
router.put('/saved/:id', checkRights('hotels', 'canUpdate'), checkRecordOwnership(findSaved), updateSaved);
router.delete('/saved/:id', checkRights('hotels', 'canDelete'), checkRecordOwnership(findSaved), deleteSaved);

export default router;
