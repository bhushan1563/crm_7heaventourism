import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

// Same JSON envelope the rest of the API uses, so the web app can show `message` as-is.
const limiter = ({ windowMs, limit, message, keyGenerator }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => res.status(429).json({ success: false, message })
  });

/** Whole API: generous, only stops runaway clients / scrapers. */
export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: 'Too many requests. Please slow down and try again in a minute.'
});

/**
 * Login: keyed per IP + email so one attacker can't lock out everybody behind a shared office IP,
 * and one account can't be brute-forced from many addresses at the same rate. Only failures count.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    return `${ipKeyGenerator(req.ip)}|${email}`;
  },
  // The login endpoint answers failures with HTTP 200 + success:false, so count those as failures.
  requestWasSuccessful: (req, res) => res.statusCode < 400 && res.locals.loginSucceeded === true,
  handler: (req, res) =>
    res.status(429).json({ success: false, message: 'Too many failed login attempts. Please try again in 15 minutes.' })
});

/** OCR is CPU and memory heavy: cap it per user/IP. */
export const scanLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 12,
  message: 'Too many scans in a short time. Please wait a minute and try again.',
  keyGenerator: (req) => (req.user ? `u:${req.user._id}` : ipKeyGenerator(req.ip))
});
