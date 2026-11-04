// Repairs quotations that came from the old CSV export, in the database in backend/.env.
//
//   npm run repair-legacy -- "old data"             preview: shows what would change, writes nothing
//   npm run repair-legacy -- "old data" --apply     makes the changes
//
// What it fixes, only where the database is wrong or empty (anything somebody typed is never touched):
//   1. The price line ("Rs 0 Per person (Incl of GST)" is the default every quotation is saved with, so every imported quotation printed
//      "Rs 0" even with a price). It is set to the real per-person price.
//   2. A missing per-person price, grand total, duration or pax, taken from 7Heaven_Quotations.csv in the folder (when the file is there).
// The export holds only these summary columns. Hotels, itineraries, inclusions and policies were never in it, so they cannot be restored
// from it; they have to be entered on the quotation (or restored from a database backup: npm run restore-db).
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, 'backend', '.env') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const folderArg = args.find((a) => !a.startsWith('--'));

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
};

const fromCsv = new Map();
if (folderArg) {
  const file = path.join(path.resolve(folderArg), '7Heaven_Quotations.csv');
  if (fs.existsSync(file)) {
    const [head, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
    for (const r of rows) {
      const rec = Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()]));
      if (rec['Quotation No']) fromCsv.set(rec['Quotation No'], rec);
    }
  } else console.log(`(no 7Heaven_Quotations.csv in ${folderArg}: only the price lines are repaired)`);
}

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;
const auto = (n) => `${money(n)} Per person (Incl of GST)`;
const AUTOMATIC = /^Rs\s*([\d,]+(?:\.\d+)?)\s+Per person \(Incl of GST\)$/i;
const plain = (html) => String(html || '').replace(/<[^>]*>/g, '').trim();
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

dns.setDefaultResultOrder('ipv4first');
const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);
else if (process.env.NODE_ENV !== 'production') dns.setServers(['8.8.8.8', '8.8.4.4']);

const { connectDB, disconnectDB } = await import('../backend/src/config/db.js');
const { default: QuotationModel } = await import('../backend/src/models/Quotation.js');

let changed = 0;
try {
  await connectDB();
  const docs = await QuotationModel.find({ deleted: false }).select('quotationNo duration paxDetails pricing').lean();
  for (const q of docs) {
    const set = {};
    const csv = fromCsv.get(q.quotationNo);
    const pricing = q.pricing || {};
    let per = Number(pricing.totalCostPerPerson) || 0;
    if (csv && per === 0 && num(csv['Cost Per Person']) > 0) { per = num(csv['Cost Per Person']); set['pricing.totalCostPerPerson'] = per; }
    if (csv && !(Number(pricing.grandTotal) > 0) && num(csv['Grand Total']) > 0) set['pricing.grandTotal'] = num(csv['Grand Total']);
    if (csv && !String(q.duration || '').trim() && csv['Duration']) set.duration = csv['Duration'];
    if (csv && !String(q.paxDetails || '').trim() && csv['Pax']) set.paxDetails = csv['Pax'];

    const text = plain(pricing.totalCostNote);
    const m = AUTOMATIC.exec(text);
    const stale = !text || (m && (num(m[1]) === 0 || num(m[1]) !== per));
    if (per > 0 && stale) set['pricing.totalCostNote'] = auto(per);

    if (!Object.keys(set).length) continue;
    changed++;
    console.log(`${q.quotationNo}: ${Object.entries(set).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')}`);
    if (apply) await QuotationModel.collection.updateOne({ _id: q._id }, { $set: set }); // direct: keeps the "last changed" date and version as they are
  }
  console.log(`\n${changed} quotation${changed === 1 ? '' : 's'} ${apply ? 'repaired' : 'would be repaired. Run again with --apply to make the changes'}.`);
} catch (error) {
  console.error('\nRepair failed:', String(error.message).replace(/\/\/[^@\s]+@/g, '//***@'));
  process.exitCode = 1;
} finally {
  await disconnectDB().catch(() => {});
}
