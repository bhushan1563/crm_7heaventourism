import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { config, validateConfig } from './config/env.js';
import { connectDB, disconnectDB, isDbConnected } from './config/db.js';
import { seedDatabase } from './utils/seedData.js';
import { apiLimiter, mediaServeLimiter } from './middleware/rateLimit.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import guestRoutes from './routes/guestRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import userRoutes from './routes/userRoutes.js';
import rightsRoutes from './routes/rightsRoutes.js';
import scannerRoutes from './routes/scannerRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import { serveMedia } from './controllers/mediaController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dns.setDefaultResultOrder('ipv4first');
// Some home/office networks cannot resolve Atlas `mongodb+srv` records. Opt in with DNS_SERVERS=8.8.8.8,8.8.4.4;
// in development the public resolvers are used by default, as before. Servers should use their own resolver.
if (config.dnsServers.length) dns.setServers(config.dnsServers);
else if (!config.isProduction) dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();

app.disable('x-powered-by');
// Behind Nginx / Vercel the real client IP is in X-Forwarded-For; rate limiting needs it.
app.set('trust proxy', config.trustProxy);

// Security headers. The app is served as an SPA that loads Google Fonts and blob/data images (scanner preview, PDFs).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'connect-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
        // HTTPS is enforced by Nginx / the platform (+ HSTS below); this directive would break a production build run over http://localhost.
        'upgrade-insecure-requests': null
      }
    },
    // HTTPS-only for a year, but not for sibling subdomains (mail., www., ...) that may not be on HTTPS themselves.
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' } // the APK / API are fetched from other origins on purpose
  })
);

// Browser features: the document scanner needs the camera of this origin; nothing else is used.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

app.use(compression());

app.use(
  cors({
    // No allow-list configured: reflect any origin (Bearer-token API, no cookies). Otherwise only the listed origins.
    origin: config.corsOrigins.length
      ? (origin, callback) =>
          !origin || config.corsOrigins.includes(origin) ? callback(null, true) : callback(new Error('Not allowed by CORS'))
      : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  })
);

// Throttle before any body is read, so a flood of large requests is rejected cheaply.
app.use('/api', apiLimiter);

// Request bodies: small by default; only the scanner accepts a (base64) image in JSON.
app.use('/api/scanner', express.json({ limit: '15mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(
  morgan(config.isProduction ? 'combined' : 'dev', {
    skip: (req) => req.path === '/api/health'
  })
);

// Health check for load balancers / uptime monitors: 503 when the database is unreachable.
app.get('/api/health', (req, res) => {
  const dbUp = isDbConnected();
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'healthy' : 'degraded',
    app: '7Heaven Luxury Travel CRM',
    database: dbUp ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Bundled downloads (e.g. the Android APK). Static assets only; directory listing and dotfiles are off.
app.use(
  '/static',
  express.static(path.join(__dirname, 'uploads'), { dotfiles: 'ignore', index: false, maxAge: '1h' })
);

// Photos (public, unguessable, cached for a year): /media/<token> and /media/<token>/thumb
app.get('/media/:token', mediaServeLimiter, serveMedia('full'));
app.get('/media/:token/thumb', mediaServeLimiter, serveMedia('thumb'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rights', rightsRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api', apiNotFound);

// Serve the built frontend when it exists (monorepo single-server deployment).
// In development the Vite dev server serves the UI, so this is skipped until `npm run build` has run.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(
    express.static(frontendDist, {
      index: false,
      dotfiles: 'ignore',
      setHeaders: (res, filePath) => {
        // Vite fingerprints everything under /assets, so it can be cached forever; HTML must always be revalidated.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      }
    })
  );
  // SPA fallback: non-API, non-static, non-photo GET requests get index.html (client-side routing)
  app.get(/^\/(?!api(\/|$)|static(\/|$)|media(\/|$)).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(errorHandler);

// Start Server & Seed Database
const startServer = async () => {
  try {
    validateConfig().forEach((warning) => console.warn(`[7Heaven] Warning: ${warning}`));

    await connectDB();
    await seedDatabase();

    const server = app.listen(config.port, config.host, () => {
      console.log(`[7Heaven] Server listening on ${config.host}:${config.port} (${config.isProduction ? 'production' : 'development'})`);
    });

    // Let in-flight requests finish and close the database cleanly on deploys/restarts (PM2 sends SIGINT/SIGTERM).
    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[7Heaven] ${signal} received, shutting down...`);
      server.close(async () => {
        await disconnectDB().catch(() => {});
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref(); // do not hang forever on stuck connections
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[7Heaven] Failed to start server:', error.message);
    process.exit(1); // let PM2 / the platform restart or surface the failure instead of idling without a listener
  }
};

process.on('unhandledRejection', (reason) => {
  console.error('[7Heaven] Unhandled promise rejection:', reason);
});

// On Vercel the app is exported and run as a serverless function (see api/index.js), so don't listen.
if (!config.isVercel) {
  startServer();
}

export default app;
