// Backs up the whole database to compressed JSON-lines files (MongoDB Extended JSON keeps ObjectIds and dates exact).
// Atlas' free tier has no backups, and a server snapshot does not contain an external database - so schedule this.
//
//   node scripts/backup-db.mjs                         -> <repo>/backups/<timestamp>/
//   node scripts/backup-db.mjs --dir /var/backups/7heaven --keep 14
//   cron (as the app user):  0 3 * * *  cd /var/www/7heaven-crm && node scripts/backup-db.mjs --keep 14 >> backups/backup.log 2>&1
//
// Reads MONGODB_URI from backend/.env (or ENV_FILE / the environment) and never prints it. The files contain customer data
// and password hashes: the folder is created private (mode 700) - keep copies somewhere safe and off the server.
// Restore with: node scripts/restore-db.mjs <backup folder> --yes
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: process.env.ENV_FILE || path.join(root, 'backend', '.env') });

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const baseDir = path.resolve(option('dir', process.env.BACKUP_DIR || path.join(root, 'backups')));
const keep = Math.max(1, parseInt(option('keep', '14'), 10) || 14);

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (backend/.env or the environment).');
  process.exit(1);
}

// Same resolver behaviour as the API: some development networks cannot resolve Atlas SRV records.
dns.setDefaultResultOrder('ipv4first');
const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);
else if (process.env.NODE_ENV !== 'production') dns.setServers(['8.8.8.8', '8.8.4.4']);

const { EJSON } = mongoose.mongo.BSON;
const stamp = new Date().toISOString().replace(/\.\d+Z$/, '').replace('T', '_').replace(/:/g, '');
const target = path.join(baseDir, stamp);

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(baseDir, 0o700); } catch { /* not supported on this OS */ }

  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
  const manifest = { createdAt: new Date().toISOString(), database: db.databaseName, format: 'ejson-lines-gzip', collections: {} };

  for (const name of collections) {
    const file = path.join(target, `${name}.jsonl.gz`);
    let count = 0;
    const lines = async function* () {
      for await (const doc of db.collection(name).find({})) {
        count++;
        yield EJSON.stringify(doc, { relaxed: false }) + '\n';
      }
    };
    await pipeline(Readable.from(lines()), createGzip(), fs.createWriteStream(file, { mode: 0o600 }));
    manifest.collections[name] = count;
    console.log(`  ${name.padEnd(14)} ${String(count).padStart(6)} documents`);
  }
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });

  // Retention: keep the newest `keep` backups, delete the rest.
  const all = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const old of all.slice(keep)) {
    fs.rmSync(path.join(baseDir, old), { recursive: true, force: true });
    console.log(`  removed old backup ${old}`);
  }

  const total = Object.values(manifest.collections).reduce((a, b) => a + b, 0);
  console.log(`Backup complete: ${total} documents in ${collections.length} collections -> ${target}`);
} catch (error) {
  console.error('Backup failed:', String(error.message).replace(/\/\/[^@\s]+@/g, '//***@'));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
