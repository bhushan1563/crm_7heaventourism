// Finds (and, with --delete, removes) stored photos that no record uses any more, to give database space back.
//
//   npm run media-cleanup              shows what would be removed, changes nothing
//   npm run media-cleanup -- --delete  removes them
//
// Photos uploaded in the last 24 hours are always kept: they may belong to a form that has not been saved yet.
// Take a backup first if you are unsure (npm run backup-db). The connection string is never printed.
import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from '../backend/src/config/env.js';
import { connectDB, disconnectDB } from '../backend/src/config/db.js';
import { deleteOrphans, findOrphans } from '../backend/src/services/mediaCleanup.js';
import { getMediaSources } from '../backend/src/services/mediaSources.js';
import { getStorageUsage } from '../backend/src/controllers/mediaController.js';

dns.setDefaultResultOrder('ipv4first');
if (config.dnsServers.length) dns.setServers(config.dnsServers);
else if (!config.isProduction) dns.setServers(['8.8.8.8', '8.8.4.4']);

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
let code = 0;
try {
  await connectDB();
  const sources = await getMediaSources();
  const before = await getStorageUsage();
  console.log(`Stored photos: ${before.count} (${mb(before.usedBytes)} of ${mb(before.quotaBytes)})`);
  if (process.argv.includes('--delete')) {
    const { removed, freedBytes } = await deleteOrphans(sources);
    console.log(`Removed ${removed} unused photo(s), freed ${mb(freedBytes)}.`);
  } else {
    const orphans = await findOrphans(sources);
    const bytes = orphans.reduce((sum, m) => sum + (m.size || 0) + (m.thumbSize || 0), 0);
    console.log(`${orphans.length} unused photo(s) (${mb(bytes)}) would be removed. Run again with --delete to remove them.`);
  }
} catch (error) {
  code = 1;
  console.error('Clean-up failed:', String(error.message).replace(/\/\/[^@\s/]+@/g, '//***@'));
} finally {
  await disconnectDB().catch(() => {});
  await mongoose.disconnect().catch(() => {});
}
process.exit(code);
