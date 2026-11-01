import express from 'express';
import { createHotel, deleteHotel, findHotelDocument, getCities, getHotelById, getHotels, updateHotel } from '../controllers/hotelController.js';
import { protect } from '../middleware/auth.js';
import { checkRecordOwnership, checkRights } from '../middleware/checkRights.js';

const router = express.Router();
const findHotel = (req) => findHotelDocument(req.params.id);

router.use(protect);

router.get('/cities', checkRights('hotels', 'canRead'), getCities);
router.get('/', checkRights('hotels', 'canRead'), getHotels);
router.get('/:id', checkRights('hotels', 'canRead'), getHotelById);
router.post('/', checkRights('hotels', 'canCreate'), createHotel);
router.put('/:id', checkRights('hotels', 'canUpdate'), checkRecordOwnership(findHotel), updateHotel);
router.delete('/:id', checkRights('hotels', 'canDelete'), checkRecordOwnership(findHotel), deleteHotel);

export default router;
