// Imports CSV exports (the files the app's "Export Data" button produces) into the database in backend/.env.
//
//   npm run import-csv -- "old data" --dry-run     preview: parse + validate every row, touch nothing
//   npm run import-csv -- "old data"               import
//
// Looks for these files in the folder:  7Heaven_Users.csv, 7Heaven_Suppliers.csv,
// 7Heaven_Guest_Inquiries.csv, 7Heaven_Quotations.csv   (any that are missing are skipped).
//
// Safe to re-run: records that already exist (by email / Sr No / Quotation No / supplier name+phone) are left
// untouched, never overwritten or duplicated. The CSVs contain no passwords, so every NEW user gets a unique random
// temporary password, written to <folder>/IMPORTED_USER_LOGINS.csv (and never printed). An Admin can reset any
// password from User Management afterwards; delete that file once the logins have been handed out.
import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, 'backend', '.env') });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const folderArg = args.find((a) => !a.startsWith('--'));
if (!folderArg) {
  console.error('Usage: npm run import-csv -- <folder with the CSV files> [--dry-run]');
  process.exit(1);
}
const folder = path.resolve(folderArg);

// ---------------------------------------------------------------------------------------------------------------
// CSV parsing (RFC 4180: quoted fields, embedded commas / quotes / new lines)
// ---------------------------------------------------------------------------------------------------------------
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return data.map((r, i) => ({ __row: i + 2, ...Object.fromEntries(names.map((h, j) => [h, (r[j] ?? '').trim()])) }));
};

const readCsv = (file) => {
  const full = path.join(folder, file);
  return fs.existsSync(full) ? parseCsv(fs.readFileSync(full, 'utf8')) : null;
};

// DD-MM-YYYY (the app's display format) or YYYY-MM-DD  ->  Date at UTC midnight (how the app stores date inputs)
const parseDate = (value) => {
  const v = String(value || '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(Date.UTC(+y, +mo - 1, +d));
    return date.getUTCMonth() === +mo - 1 ? date : null;
  }
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
};

const num = (value, fallback = 0) => {
  const n = Number(String(value ?? '').replace(/[, ₹]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------------------------------------------
// Mapping + validation (no database needed, so --dry-run works offline)
// ---------------------------------------------------------------------------------------------------------------
const GUEST_STATUSES = ['Under Process', 'Follow up', 'Quoted', 'Confirmed', 'Confirmed & Payment received', 'Travelled', 'Cancelled'];
const QUOTE_STATUSES = ['Draft', 'Follow up', 'Sent', 'Confirmed', 'Revised', 'Expired', 'Cancelled'];
const QUOTE_TYPES = ['Only Hotel', 'Package', 'Events / Corporate'];
const SUPPLIER_CATEGORIES = ['All', 'Domestic', 'International', 'Flight Consolidator', 'Visa', 'General'];
const ROLES = ['Admin', 'Sales', 'Ops', 'Viewer'];

const report = { users: {}, suppliers: {}, guests: {}, quotations: {} };
const issues = [];
const issue = (kind, row, message) => issues.push(`${kind} row ${row}: ${message}`);

const mapUsers = (rows) => {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const email = r['Email'].toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { issue('user', r.__row, 'invalid email, skipped'); continue; }
    if (seen.has(email)) { issue('user', r.__row, 'duplicate email in file, skipped'); continue; }
    seen.add(email);
    if (!r['First Name'] || !r['Last Name']) { issue('user', r.__row, 'first/last name missing, skipped'); continue; }
    let role = ROLES.find((x) => x.toLowerCase() === r['Role'].toLowerCase());
    if (!role) { issue('user', r.__row, `unknown role "${r['Role']}", imported as Viewer`); role = 'Viewer'; }
    out.push({ email, firstName: r['First Name'], lastName: r['Last Name'], role, phone: r['Phone'], active: !/^inactive$/i.test(r['Status']) });
  }
  return out;
};

const mapSuppliers = (rows) => {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const key = `${r['Supplier Name'].toLowerCase()}|${r['Phone']}`;
    if (seen.has(key)) { issue('supplier', r.__row, 'duplicate in file, skipped'); continue; }
    seen.add(key);
    const missing = ['Supplier Name', 'Category', 'Contact Person', 'Phone'].filter((f) => !r[f]);
    if (missing.length) { issue('supplier', r.__row, `missing ${missing.join(', ')}, skipped`); continue; }
    let category = SUPPLIER_CATEGORIES.find((c) => c.toLowerCase() === r['Category'].toLowerCase());
    if (!category) { issue('supplier', r.__row, `unknown category "${r['Category']}", imported as General`); category = 'General'; }
    out.push({
      supplierName: r['Supplier Name'], category, contactPerson: r['Contact Person'], phone: r['Phone'], email: r['Email'],
      city: r['City'], country: r['Country'] || 'India', services: r['Services'],
      rating: Math.min(5, Math.max(1, Math.round(num(r['Rating'], 5)) || 5)), active: !/^inactive$/i.test(r['Active'])
    });
  }
  return out;
};

const mapGuests = (rows) => {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const srNo = r['Sr No'];
    if (!srNo) { issue('guest', r.__row, 'Sr No missing, skipped'); continue; }
    if (seen.has(srNo)) { issue('guest', r.__row, `duplicate Sr No ${srNo} in file, skipped`); continue; }
    seen.add(srNo);
    const travelDate = parseDate(r['Travel Date']);
    const inquiryDate = parseDate(r['Inquiry Date']);
    const missing = [];
    if (!r['Guest Names']) missing.push('Guest Names');
    if (!r['Contact Number']) missing.push('Contact Number');
    if (!r['Destination']) missing.push('Destination');
    if (!travelDate) missing.push('Travel Date');
    if (!r['Sales Person']) missing.push('Sales Person');
    if (!r['Ops Person']) missing.push('Ops Person');
    if (missing.length) { issue('guest', r.__row, `${srNo}: missing/invalid ${missing.join(', ')}, skipped`); continue; }
    let status = GUEST_STATUSES.find((s) => s.toLowerCase() === r['Status'].toLowerCase());
    if (!status) { issue('guest', r.__row, `${srNo}: unknown status "${r['Status']}", imported as Under Process`); status = 'Under Process'; }
    out.push({
      srNo, inquiryDate: inquiryDate || travelDate, guestNames: r['Guest Names'], contactNumber: r['Contact Number'], email: r['Email'],
      destination: r['Destination'], travelDate, status, sales: r['Sales Person'], ops: r['Ops Person'],
      paxCount: Math.max(1, Math.round(num(r['Pax Count'], 2)) || 2), budget: r['Estimated Budget'], notes: r['Notes']
    });
  }
  return out;
};

const mapQuotations = (rows) => {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const quotationNo = r['Quotation No'];
    if (!quotationNo) { issue('quotation', r.__row, 'Quotation No missing, skipped'); continue; }
    if (seen.has(quotationNo)) { issue('quotation', r.__row, `duplicate ${quotationNo} in file, skipped`); continue; }
    seen.add(quotationNo);
    if (!r['Client Name'] || !r['Destination']) { issue('quotation', r.__row, `${quotationNo}: client/destination missing, skipped`); continue; }
    let status = QUOTE_STATUSES.find((s) => s.toLowerCase() === r['Status'].toLowerCase());
    if (!status) { issue('quotation', r.__row, `${quotationNo}: unknown status "${r['Status']}", imported as Draft`); status = 'Draft'; }
    const quotationType = QUOTE_TYPES.find((t) => t.toLowerCase() === r['Type'].toLowerCase()) || 'Package';
    out.push({
      quotationNo, quotationType, clientName: r['Client Name'], destination: r['Destination'], duration: r['Duration'],
      paxDetails: r['Pax'], travelDate: parseDate(r['Travel Date']), status, sales: r['Sales Agent'], ops: r['Ops Agent'],
      pricing: { totalCostPerPerson: num(r['Cost Per Person']), grandTotal: num(r['Grand Total']), totalCostNote: `Rs ${num(r['Cost Per Person']).toLocaleString('en-IN')} Per person (Incl of GST)` }
    });
  }
  return out;
};

const files = {
  users: ['7Heaven_Users.csv', mapUsers],
  suppliers: ['7Heaven_Suppliers.csv', mapSuppliers],
  guests: ['7Heaven_Guest_Inquiries.csv', mapGuests],
  quotations: ['7Heaven_Quotations.csv', mapQuotations]
};

const parsed = {};
for (const [name, [file, mapper]] of Object.entries(files)) {
  const rows = readCsv(file);
  if (!rows) {
    console.log(`- ${file}: not found, skipped`);
    continue;
  }
  parsed[name] = mapper(rows);
  report[name] = { inFile: rows.length, valid: parsed[name].length };
  console.log(`- ${file}: ${rows.length} rows, ${parsed[name].length} valid`);
}

if (issues.length) {
  console.log(`\n${issues.length} data note(s):`);
  issues.forEach((i) => console.log('  ' + i));
}

if (dryRun) {
  console.log('\nDRY RUN: nothing was written. Re-run without --dry-run to import.');
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------------------------
dns.setDefaultResultOrder('ipv4first');
// Same resolver behaviour as the API: some networks can't resolve Atlas SRV records.
const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);
else if (process.env.NODE_ENV !== 'production') dns.setServers(['8.8.8.8', '8.8.4.4']);

const { connectDB, disconnectDB } = await import('../backend/src/config/db.js');
const { seedDatabase } = await import('../backend/src/utils/seedData.js');
const { default: UserModel } = await import('../backend/src/models/User.js');
const { default: RightModel } = await import('../backend/src/models/Right.js');
const { default: GuestModel } = await import('../backend/src/models/Guest.js');
const { default: SupplierModel } = await import('../backend/src/models/Supplier.js');
const { default: QuotationModel } = await import('../backend/src/models/Quotation.js');

const newPassword = () => crypto.randomBytes(12).toString('base64url'); // 16 chars, ~96 bits

try {
  await connectDB();
  await seedDatabase(); // makes sure the default role rights exist before users are created

  // ---- users ----
  const credentials = [];
  if (parsed.users) {
    const stats = { created: 0, existing: 0 };
    const modules = ['guest_list', 'supplier_list', 'users', 'rights', 'scanner', 'reports']; // same set the "Create User" screen snapshots
    for (const u of parsed.users) {
      if (await UserModel.exists({ email: u.email })) { stats.existing++; continue; }
      const password = newPassword();
      const created = await UserModel.create({ ...u, password, deleted: false });
      const roleRights = await RightModel.find({ userRole: u.role, userId: null }).lean();
      for (const mod of modules) {
        const match = roleRights.find((r) => r.module === mod);
        await RightModel.findOneAndUpdate(
          { userId: String(created._id), module: mod },
          {
            userId: String(created._id), module: mod,
            canCreate: match ? match.canCreate : false, canRead: match ? match.canRead : true, canUpdate: match ? match.canUpdate : false,
            canDelete: match ? match.canDelete : false, canDownload: match ? match.canDownload : false, canEditOthers: match ? match.canEditOthers : false
          },
          { upsert: true, new: true }
        );
      }
      credentials.push({ email: u.email, name: `${u.firstName} ${u.lastName}`, role: u.role, password });
      stats.created++;
    }
    report.users = { ...report.users, ...stats };
  }

  if (credentials.length) {
    const file = path.join(folder, 'IMPORTED_USER_LOGINS.csv');
    const isNew = !fs.existsSync(file);
    const line = (c) => [c.email, c.name, c.role, c.password].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    fs.appendFileSync(file, (isNew ? 'Email,Name,Role,Temporary Password\n' : '') + credentials.map(line).join('\n') + '\n');
    console.log(`\nTemporary logins for ${credentials.length} new user(s) saved to: ${file}`);
    console.log('  (git-ignored and local only. Hand them out, then delete the file; an Admin can reset any password in User Management.)');
  }

  // ---- who owns the records ----
  const allUsers = await UserModel.find({ deleted: false }).select('_id firstName lastName role').lean();
  const fullName = (u) => `${u.firstName} ${u.lastName}`.trim().toLowerCase();
  const findUser = (name, role) => {
    const key = String(name || '').trim().toLowerCase();
    const sameName = allUsers.filter((u) => fullName(u) === key);
    return sameName.find((u) => u.role === role) || sameName[0] || null;
  };
  const admin = allUsers.find((u) => u.role === 'Admin') || allUsers[0];
  const adminId = admin ? String(admin._id) : 'csv-import';
  const adminName = admin ? `${admin.firstName} ${admin.lastName}` : 'CSV import';
  const audit = (salesName, opsName) => {
    const sales = findUser(salesName, 'Sales');
    const ops = findUser(opsName, 'Ops');
    return {
      salesId: sales ? String(sales._id) : '', opsId: ops ? String(ops._id) : '',
      createdBy: sales ? String(sales._id) : adminId, createdByName: sales ? `${sales.firstName} ${sales.lastName}` : adminName
    };
  };

  // Oldest first, with createdAt preserving the original order, because the lists sort newest-first by createdAt.
  const importSet = async (label, Model, keyField, docs, build, keyOf = (d) => d[keyField]) => {
    const keys = docs.map(keyOf);
    const existingKeys = new Set((await Model.find({ [keyField]: { $in: keys } }).select(keyField).lean()).map((d) => d[keyField]));
    const fresh = docs.filter((d) => !existingKeys.has(keyOf(d)));
    const ordered = [...fresh].reverse();
    let inserted = 0;
    const invalid = [];
    for (const [i, d] of ordered.entries()) {
      const doc = build(d, i);
      try {
        await Model.create(doc);
        inserted++;
      } catch (e) {
        invalid.push(`${label} ${keyOf(d)}: ${e.message}`);
      }
    }
    report[label] = { ...report[label], inserted, existing: existingKeys.size, rejected: invalid.length };
    invalid.forEach((m) => console.log('  ✗ ' + m));
  };

  const t0 = Date.now();
  if (parsed.suppliers) {
    // suppliers have no unique key: identify by name + phone
    const existing = await SupplierModel.find({}).select('supplierName phone').lean();
    const known = new Set(existing.map((s) => `${s.supplierName.toLowerCase()}|${s.phone}`));
    let inserted = 0;
    for (const [i, s] of [...parsed.suppliers].reverse().entries()) {
      if (known.has(`${s.supplierName.toLowerCase()}|${s.phone}`)) continue;
      try {
        await SupplierModel.create({ ...s, createdBy: adminId, createdByName: adminName, updatedBy: adminId, updatedByName: adminName, createdAt: new Date(t0 + i) });
        inserted++;
      } catch (e) {
        console.log(`  ✗ supplier row: ${e.message}`);
      }
    }
    report.suppliers = { ...report.suppliers, inserted, existing: parsed.suppliers.length - inserted };
  }

  if (parsed.guests) {
    await importSet('guests', GuestModel, 'srNo', parsed.guests, (g, i) => {
      const a = audit(g.sales, g.ops);
      return { ...g, ...a, updatedBy: a.createdBy, updatedByName: a.createdByName, createdAt: new Date(g.inquiryDate.getTime() + i) };
    });
  }

  if (parsed.quotations) {
    await importSet('quotations', QuotationModel, 'quotationNo', parsed.quotations, (q, i) => {
      const a = audit(q.sales, q.ops);
      const { createdBy, createdByName, salesId, opsId } = a;
      return { ...q, createdBy, createdByName, salesId: salesId || null, opsId: opsId || null, createdAt: new Date(t0 + i) };
    });
  }

  console.log('\n=== Import result ===');
  for (const [name, r] of Object.entries(report)) {
    if (Object.keys(r).length) console.log(`  ${name.padEnd(11)}`, JSON.stringify(r));
  }
  console.log('\n=== Now in the database ===');
  console.log('  users      ', await UserModel.countDocuments({ deleted: false }));
  console.log('  suppliers  ', await SupplierModel.countDocuments({ deleted: false }));
  console.log('  guests     ', await GuestModel.countDocuments({ deleted: false }));
  console.log('  quotations ', await QuotationModel.countDocuments({ deleted: false }));
} catch (error) {
  console.error('\nImport failed:', String(error.message).replace(/\/\/[^@\s]+@/g, '//***@'));
  process.exitCode = 1;
} finally {
  await disconnectDB().catch(() => {});
}
