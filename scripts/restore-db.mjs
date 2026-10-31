// Restores a backup made by scripts/backup-db.mjs.
//
//   node scripts/restore-db.mjs backups/2026-10-31_030000 --yes            restore into EMPTY collections only
//   node scripts/restore-db.mjs backups/2026-10-31_030000 --yes --drop     replace whatever is there (destructive!)
//
// It refuses to touch a collection that already has data unless you pass --drop, and it never runs without --yes.
// Uses MONGODB_URI from backend/.env (or ENV_FILE / the environment) and never prints it.
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: process.env.ENV_FILE || path.join(root, 'backend', '.env') });

const args = process.argv.slice(2);
const folderArg = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--yes');
const drop = args.includes('--drop');

if (!folderArg) {
  console.error('Usage: node scripts/restore-db.mjs <backup folder> --yes [--drop]');
  process.exit(1);
}
const folder = path.resolve(folderArg);
const manifestPath = path.join(folder, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`Not a backup folder (no manifest.json): ${folder}`);
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (backend/.env or the environment).');
  process.exit(1);
}

dns.setDefaultResultOrder('ipv4first');
const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);
else if (process.env.NODE_ENV !== 'production') dns.setServers(['8.8.8.8', '8.8.4.4']);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const { EJSON } = mongoose.mongo.BSON;

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const plan = [];
  for (const [name, count] of Object.entries(manifest.collections)) {
    const existing = await db.collection(name).estimatedDocumentCount();
    plan.push({ name, count, existing });
  }

  console.log(`Backup of "${manifest.database}" taken ${manifest.createdAt}`);
  console.log(`Target database: "${db.databaseName}"`);
  plan.forEach((p) => console.log(`  ${p.name.padEnd(14)} backup ${String(p.count).padStart(6)}   currently in database ${String(p.existing).padStart(6)}`));

  if (!confirmed) {
    console.error('\nNothing was changed. Re-run with --yes to restore.');
    process.exit(1);
  }
  const blocked = plan.filter((p) => p.existing > 0);
  if (blocked.length && !drop) {
    console.error(`\nRefusing to restore over existing data (${blocked.map((p) => p.name).join(', ')}). Use --drop to replace it.`);
    process.exit(1);
  }

  for (const { name } of plan) {
    const collection = db.collection(name);
    if (drop) await collection.drop().catch(() => {}); // ignore "ns not found"
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(folder, `${name}.jsonl.gz`)).pipe(createGunzip()), crlfDelay: Infinity });
    let batch = [];
    let restored = 0;
    const flush = async () => {
      if (!batch.length) return;
      await collection.insertMany(batch, { ordered: false });
      restored += batch.length;
      batch = [];
    };
    for await (const line of lines) {
      if (!line.trim()) continue;
      batch.push(EJSON.parse(line, { relaxed: false }));
      if (batch.length >= 500) await flush();
    }
    await flush();
    console.log(`  restored ${String(restored).padStart(6)} into ${name}`);
  }
  console.log('Restore complete. Restart the app so it re-creates any missing indexes:  pm2 restart 7heaven-crm');
} catch (error) {
  console.error('Restore failed:', String(error.message).replace(/\/\/[^@\s]+@/g, '//***@'));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
