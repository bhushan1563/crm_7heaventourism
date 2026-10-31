// Sets a new password for an existing user - for when nobody knows (or has lost) a password, e.g. the temporary passwords the
// CSV import generated. Uses the database in backend/.env (or ENV_FILE / MONGODB_URI) and the same hashing as the app.
// The password is never put on the command line (it would end up in the shell history and the process list): it is read
// from standard input, or typed at a hidden prompt.
//
//   Hidden prompt:   npm run reset-password -- someone@example.com
//   From a pipe:     printf '%s' "$PW" | node scripts/reset-password.mjs someone@example.com
//
// Existing sessions of that user are ended (they must sign in again). Role, name and the rest are not touched.
import dns from 'node:dns';
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../backend/src/config/env.js';
import { connectDB, disconnectDB } from '../backend/src/config/db.js';
import UserModel from '../backend/src/models/User.js';

const MIN_LENGTH = 8;
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email || email.startsWith('-')) {
  console.error('Usage: npm run reset-password -- <email>     (the new password is asked for, or read from standard input)');
  process.exit(1);
}

const readPassword = () => new Promise((resolve) => {
  if (!process.stdin.isTTY) {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data.replace(/[\r\n]+$/, '')));
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (text) => { if (text.includes('\n') || text.includes('\r')) process.stdout.write(text); }; // hide what is typed
  process.stdout.write(`New password for ${email} (at least ${MIN_LENGTH} characters, hidden): `);
  rl.question('', (answer) => { rl.close(); resolve(answer); });
});

dns.setDefaultResultOrder('ipv4first');
if (config.dnsServers.length) dns.setServers(config.dnsServers);
else if (!config.isProduction) dns.setServers(['8.8.8.8', '8.8.4.4']);

let code = 0;
try {
  const password = await readPassword();
  if (password.length < MIN_LENGTH) throw new Error(`The password must be at least ${MIN_LENGTH} characters.`);
  if (password.length > 200) throw new Error('The password is too long (200 characters at most).');

  await connectDB();
  const hash = await bcrypt.hash(password, 10);
  const user = await UserModel.findOneAndUpdate(
    { email, deleted: false },
    { password: hash, passwordChangedAt: new Date(Math.floor(Date.now() / 1000) * 1000) }, // ends every existing session
    { new: true }
  ).select('email role firstName lastName');
  if (!user) throw new Error(`No active user with the email ${email}.`);
  console.log(`Password updated for ${user.email} (${user.role}, ${user.firstName} ${user.lastName}). They must sign in again.`);
} catch (error) {
  code = 1;
  console.error(`Not changed: ${String(error.message).replace(/\/\/[^@\s/]+@/g, '//***@')}`);
} finally {
  await disconnectDB().catch(() => {});
  await mongoose.disconnect().catch(() => {});
}
process.exit(code);
