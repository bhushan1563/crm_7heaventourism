import express from 'express';
import multer from 'multer';
import path from 'path';
import { processScan } from '../controllers/scannerController.js';
import { protect } from '../middleware/auth.js';
import { checkRights } from '../middleware/checkRights.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const router = express.Router();

router.use(protect);

router.post('/process', checkRights('scanner', 'canCreate'), upload.single('image'), processScan);

export default router;
