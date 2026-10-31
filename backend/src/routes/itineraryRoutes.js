import express from 'express';
import {
  createItinerary,
  deleteItinerary,
  duplicateItinerary,
  findItineraryDocument,
  getDestinations,
  getItineraries,
  getItineraryById,
  updateItinerary
} from '../controllers/itineraryController.js';
import { protect } from '../middleware/auth.js';
import { checkRecordOwnership, checkRights } from '../middleware/checkRights.js';

const router = express.Router();
const findItinerary = (req) => findItineraryDocument(req.params.id);

router.use(protect);

router.get('/destinations', checkRights('itineraries', 'canRead'), getDestinations);
router.get('/', checkRights('itineraries', 'canRead'), getItineraries);
router.get('/:id', checkRights('itineraries', 'canRead'), getItineraryById);
router.post('/', checkRights('itineraries', 'canCreate'), createItinerary);
router.post('/:id/duplicate', checkRights('itineraries', 'canCreate'), duplicateItinerary);
router.put('/:id', checkRights('itineraries', 'canUpdate'), checkRecordOwnership(findItinerary), updateItinerary);
router.delete('/:id', checkRights('itineraries', 'canDelete'), checkRecordOwnership(findItinerary), deleteItinerary);

export default router;
