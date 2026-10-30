// Vercel serverless entry: runs the Express API from the backend workspace as a single function.
// (On a VPS / locally the API is started by backend/src/server.js instead.)
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../backend/src/server.js';
import { validateConfig } from '../backend/src/config/env.js';
import { connectDB } from '../backend/src/config/db.js';
import { seedDatabase } from '../backend/src/utils/seedData.js';

// The API expects to run from backend/ (Tesseract reads eng.traineddata from the working directory).
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend'));

// Validate, connect and seed once per function instance, then reuse (what server.js's startServer does at boot).
let ready;
const connect = () => {
  if (!ready) {
    ready = Promise.resolve()
      .then(() => {
        validateConfig().forEach((warning) => console.warn(`[7Heaven] Warning: ${warning}`));
        return connectDB();
      })
      .then(() => seedDatabase())
      .catch((err) => {
        ready = undefined; // retry on the next request
        throw err;
      });
  }
  return ready;
};

export default async function handler(req, res) {
  try {
    await connect();
  } catch (error) {
    console.error('[7Heaven] Failed to start:', error.message);
    const message = error.isConfigError
      ? 'The server is not configured correctly. Check the environment variables.'
      : 'Database connection failed.';
    return res.status(500).json({ success: false, message });
  }
  return app(req, res);
}
