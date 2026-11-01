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
  // A cut-off or malformed multipart body comes out of the parser as a plain Error, not a MulterError.
  if (/^(Unexpected end of (form|multipart data)|Multipart: |Malformed part header|Part terminated early|Unsupported content type)/.test(err.message || '')) {
    return res.status(400).json({ success: false, message: 'The upload was incomplete or malformed. Please try again.' });
  }
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin not allowed.' });
  }

  // Anything else the framework rejected as the CLIENT's fault (unreadable URL, unknown charset or encoding, too many
  // parameters ...) carries a 4xx status: pass it on instead of reporting a server error.
  const status = err.status || err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ success: false, message: status === 404 ? 'Not found.' : 'The request could not be understood.' });
  }

  console.error(`[7Heaven] ${req.method} ${req.originalUrl.split('?')[0]} failed:`, err);

  // Never leak stack traces or driver messages to clients in production.
  res.status(500).json({
    success: false,
    message: config.isProduction ? 'Internal server error.' : `Internal server error: ${err.message}`
  });
};
