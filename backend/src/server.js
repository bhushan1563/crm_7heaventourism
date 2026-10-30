import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { connectDB } from './config/db.js';
import { seedDatabase } from './utils/seedData.js';

import authRoutes from './routes/authRoutes.js';
import guestRoutes from './routes/guestRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import userRoutes from './routes/userRoutes.js';
import rightsRoutes from './routes/rightsRoutes.js';
import scannerRoutes from './routes/scannerRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();
console.log("Mongo URI loaded:", !!process.env.MONGODB_URI);
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(morgan('dev'));

// API Routes
app.use('/static', express.static("./uploads"));
app.use('/static', express.static(path.join(__dirname, 'uploads'))); // bundled files (e.g. the APK) regardless of working directory
app.use('/api/auth', authRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rights', rightsRoutes);
app.use('/api/scanner', scannerRoutes);

// System Health Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: '7Heaven Luxury Travel CRM',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Serve the built frontend when it exists (monorepo single-server deployment).
// In development the Vite dev server serves the UI, so this is skipped until `npm run build` has run.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  // SPA fallback: non-API, non-static GET requests get index.html (client-side routing)
  app.get(/^\/(?!api(\/|$)|static(\/|$)).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start Server & Seed Database
const startServer = async () => {
  try {
    console.log("Starting Server")
    await connectDB();
    await seedDatabase();

    app.listen(PORT, () => {
      console.log(`✨ [7Heaven] Server active and listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

// On Vercel the app is exported and run as a serverless function (see api/index.js), so don't listen.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
