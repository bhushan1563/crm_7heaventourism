import express from 'express';
import multer from 'multer';
import { processScan } from '../controllers/scannerController.js';
import { protect } from '../middleware/auth.js';
import { checkRights } from '../middleware/checkRights.js';
import { scanLimiter } from '../middleware/rateLimit.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif', 'image/tiff']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    const error = new Error('Only image files (JPEG, PNG, WebP, BMP, GIF, TIFF) can be scanned.');
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error);
  }
});

const router = express.Router();

router.use(protect);

router.post('/process', checkRights('scanner', 'canCreate'), scanLimiter, upload.single('image'), processScan);

export default router;
