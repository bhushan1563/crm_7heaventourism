import { config } from '../config/env.js';

/** Unknown /api route -> JSON 404 (the SPA fallback only serves non-API paths). */
export const apiNotFound = (req, res) => {
  res.status(404).json({ success: false, message: `API route not found: ${req.method} ${req.originalUrl.split('?')[0]}` });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Body too large / malformed JSON (thrown by express.json) and upload problems (multer).
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'The uploaded data is too large.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Malformed JSON in request body.' });
  }
  if (err.name === 'MulterError' || err.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin not allowed.' });
  }

  console.error(`[7Heaven] ${req.method} ${req.originalUrl.split('?')[0]} failed:`, err);

  // Never leak stack traces or driver messages to clients in production.
  res.status(500).json({
    success: false,
    message: config.isProduction ? 'Internal server error.' : `Internal server error: ${err.message}`
  });
};
