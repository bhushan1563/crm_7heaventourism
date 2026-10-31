// Opens the database connection exactly the way the app does and explains a failure in plain words.
// deploy/setup-vps.sh runs it before starting the app, so a typo in MONGODB_URI stops the install with a clear message
// instead of leaving a crash-looping server.
//
//   npm run check-db                  reads backend/.env (or ENV_FILE / the environment)
//
// Prints counts of the main collections, so you can see you are connected to the database that holds your data.
// Read-only: it never writes. The connection string is never printed.
import dns from 'node:dns';
import mongoose from 'mongoose';
import { config, validateConfig } from '../backend/src/config/env.js';
import { connectDB, disconnectDB } from '../backend/src/config/db.js';

const redact = (text) => String(text).replace(/\/\/[^@\s/]+@/g, '//***@');

// What the message means and what to do about it.
const explain = (error) => {
  const message = String(error?.message || error);
  const option = message.match(/option "?([\w]+)"? cannot appear more than once/i)?.[1];
  if (option) return `The connection string repeats the option "${option}". Remove the duplicate (for example keep "w=majority" only once).`;
  if (/bad auth|authentication failed/i.test(message)) return 'The database user name or password is wrong. (Special characters in the password must be URL-encoded, e.g. @ becomes %40.)';
  if (/unescaped characters/i.test(message)) return 'The user name or password contains characters that must be URL-encoded (@ becomes %40, : becomes %3A, / becomes %2F).';
  if (/invalid scheme|invalid connection string|must include hostname/i.test(message)) return 'MONGODB_URI is not a valid MongoDB connection string. It must start with mongodb+srv:// (Atlas) or mongodb://.';
  if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(message)) return 'The cluster address could not be looked up. Check the host name in MONGODB_URI; if it is right, this server\'s DNS cannot resolve Atlas - add DNS_SERVERS=8.8.8.8,8.8.4.4 to backend/.env.';
  if (/server selection|whitelist|not whitelisted|ReplicaSetNoPrimary|ECONNREFUSED|ETIMEDOUT/i.test(message)) return 'The database did not answer. For Atlas: open Network Access and allow this server\'s public IP address (or temporarily 0.0.0.0/0), then retry.';
  return null;
};

dns.setDefaultResultOrder('ipv4first');
if (config.dnsServers.length) dns.setServers(config.dnsServers);
else if (!config.isProduction) dns.setServers(['8.8.8.8', '8.8.4.4']);

let code = 0;
try {
  validateConfig(); // MONGODB_URI / JWT_SECRET present and not a placeholder
  const connection = await connectDB();
  console.log(`Database connection OK (database: ${connection.name})`);
  const counts = [];
  for (const name of ['users', 'guests', 'suppliers', 'quotations']) {
    counts.push(`${name} ${await connection.db.collection(name).estimatedDocumentCount()}`);
  }
  console.log(`  contains: ${counts.join(', ')}`);
} catch (error) {
  code = 1;
  if (error.isConfigError) {
    console.error(`Configuration problem: ${redact(error.message)}`);
  } else {
    console.error(`Database check FAILED: ${explain(error) || 'unexpected error'}`);
    console.error(`  technical detail: ${redact(error.message || error)}`);
  }
} finally {
  await disconnectDB().catch(() => {});
  await mongoose.disconnect().catch(() => {});
}
process.exit(code);
