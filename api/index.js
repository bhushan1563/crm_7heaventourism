// Vercel serverless entry: runs the Express API from the backend workspace as a single function.
// (On a VPS / locally the API is started by backend/src/server.js instead.)
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../backend/src/server.js';
import { connectDB } from '../backend/src/config/db.js';
import { seedDatabase } from '../backend/src/utils/seedData.js';

// The API expects to run from backend/ (Tesseract reads eng.traineddata from the working directory).
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend'));

// Connect + seed once per function instance, then reuse (what server.js's startServer does at boot).
let ready;
const connect = () => {
  if (!ready) {
    ready = connectDB()
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
    console.error('Failed to start server:', error);
    return res.status(500).json({ success: false, message: 'Database connection failed.' });
  }
  return app(req, res);
}
