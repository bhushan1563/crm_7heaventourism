// Creates an Admin user in the database configured in backend/.env (or the MONGODB_URI env var).
// Needed on a fresh database: the API ships with no default login. (Alternatively set ADMIN_EMAIL and
// ADMIN_PASSWORD once and start the API on an empty database.) An existing user with the same email is left untouched.
//
//   npm run create-admin -- <email> <password> [firstName] [lastName]
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import UserModel from '../backend/src/models/User.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend/.env') });

const [argEmail, argPassword, argFirst, argLast] = process.argv.slice(2);
const email = (argEmail || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = argPassword || process.env.ADMIN_PASSWORD || '';
const firstName = argFirst || process.env.ADMIN_FIRST_NAME || 'Admin';
const lastName = argLast || process.env.ADMIN_LAST_NAME || 'User';

if (!email || !password) {
  console.error('Usage: npm run create-admin -- <email> <password> [firstName] [lastName]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('The password must be at least 8 characters.');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (backend/.env or environment).');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  if (await UserModel.exists({ email })) {
    console.log(`User ${email} already exists - nothing changed.`);
  } else {
    await UserModel.create({ email, password, firstName, lastName, role: 'Admin', phone: '', active: true, deleted: false });
    console.log(`Admin user created: ${email}`);
  }
} catch (error) {
  console.error('Failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
