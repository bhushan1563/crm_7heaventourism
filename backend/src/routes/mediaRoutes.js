import express from 'express';
import multer from 'multer';
import { MEDIA_LIMITS, getMediaUsage, requireMediaRights, uploadMedia } from '../controllers/mediaController.js';
import { protect } from '../middleware/auth.js';
import { checkRights } from '../middleware/checkRights.js';
import { mediaUploadLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Two parts per upload: the photo itself and a small preview of it. Everything stays in memory and goes straight to the database.
const parseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_LIMITS.maxImageBytes, files: 2, fields: 6, parts: 8 }
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'thumb', maxCount: 1 }
]);

// Turns upload problems into the same plain-language answer the rest of the API gives.
const uploadPhotos = (req, res, next) =>
  parseUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(200).json({ success: false, message: `This photo is larger than ${MEDIA_LIMITS.maxImageBytes / 1048576} MB. Please choose a smaller photo.` });
    }
    if (err.name === 'MulterError') {
      return res.status(200).json({ success: false, message: 'The upload was not understood. Please choose one photo and try again.' });
    }
    return next(err); // truncated / malformed bodies are handled (as a 400) by the shared error handler
  });

router.use(protect);

// Storage meter for administrators (Rights & Security permission).
router.get('/usage', checkRights('rights', 'canUpdate'), getMediaUsage);
// The permission check comes first, so a file is only read from someone who may upload it.
router.post('/', mediaUploadLimiter, requireMediaRights, uploadPhotos, uploadMedia);

export default router;
