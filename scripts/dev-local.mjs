// Runs the whole app on this computer with its OWN private database, so trying things out can never touch the live data.
//
//   npm run dev:local          API on :5000, web app on :5173, database kept in .local-db/ (survives restarts)
//   npm run dev:local -- --fresh   start again from an empty database with new sample data
//
// The database is a local MongoDB started for you (the same one the automated tests use). backend/.env is NOT read, so the
// Atlas address in it is never used here. Stop everything with Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.local-db');
const PORT = 5000;
const API = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'admin@7heaven.local', password: 'Admin-pass-123' };
const TEAM_PASSWORD = 'password-123';

if (process.argv.includes('--fresh')) fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

console.log('Starting the local database (the first run may take a moment)...');
const mongod = await MongoMemoryServer.create({ instance: { dbPath: dataDir, storageEngine: 'wiredTiger' } });

let child;
let stopping = false;
const stop = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  if (child?.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  await mongod.stop().catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const env = {
  ...process.env,
  NODE_ENV: 'development',
  ENV_FILE: path.join(dataDir, 'no-such-file.env'), // never read backend/.env (its database address may be the live one)
  PORT: String(PORT),
  MONGODB_URI: mongod.getUri('crm_local'),
  JWT_SECRET: process.env.JWT_SECRET || 'local-development-secret-not-for-production-0123456789',
  ADMIN_EMAIL: ADMIN.email,
  ADMIN_PASSWORD: ADMIN.password
};

child = spawn('npm', ['run', 'dev'], { cwd: root, env, stdio: 'inherit', shell: true });
child.on('exit', (code) => stop(code ?? 0));

const call = async (method, route, token, body) => {
  const res = await fetch(API + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({}));
};

const waitForApi = async () => {
  for (let i = 0; i < 90; i += 1) {
    try {
      if ((await fetch(`${API}/api/health`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

// Sample people and records so every screen has something to show. Only on a database that has none of it yet.
const seed = async () => {
  const login = await call('POST', '/api/auth/login', null, ADMIN);
  const token = login.token;
  if (!token) return console.log('Sample data skipped (could not sign in as the local admin).');
  const users = await call('GET', '/api/users', token);
  if ((users.data || []).some((u) => u.email === 'sana@7heaven.local')) return;

  for (const [i, [first, role]] of [['Sana', 'Sales'], ['Omar', 'Ops'], ['Vera', 'Viewer']].entries()) {
    await call('POST', '/api/users', token, { email: `${first.toLowerCase()}@7heaven.local`, password: TEAM_PASSWORD, firstName: first, lastName: 'Tester', role, phone: `98765432${i}0` });
  }
  const places = ['Switzerland & Paris', 'Maldives', 'Dubai', 'Bali, Indonesia', 'Kashmir', 'Singapore'];
  const statuses = ['Under Process', 'Follow up', 'Quoted', 'Confirmed', 'Travelled', 'Cancelled'];
  for (let i = 0; i < 8; i += 1) {
    await call('POST', '/api/guests', token, { guestNames: ['Aarav Mehta & Family', 'Priya Nair', 'Dr. Rohan Deshmukh', 'Meera Iyer'][i % 4], email: `guest${i}@example.com`, contactNumber: `+91 98${String(10000000 + i * 7919).slice(0, 8)}`, destination: places[i % places.length], travelDate: `2027-0${(i % 9) + 1}-1${i % 9}`, status: statuses[i % statuses.length], sales: 'Sana Tester', ops: 'Omar Tester', paxCount: 2 + (i % 4), notes: 'Sample guest for trying things out.' });
  }
  for (let i = 0; i < 4; i += 1) {
    await call('POST', '/api/suppliers', token, { supplierName: ['Grand Alpine Hospitality', 'Blue Lagoon Resorts', 'SkyWay Consolidators', 'Palm Grove Stays'][i], category: ['Domestic', 'International', 'Flight Consolidator', 'General'][i], contactPerson: 'Rahul Verma', email: `contact${i}@supplier.example.com`, phone: `+91 99887766${i}0`, city: ['Vadodara', 'Mumbai', 'Delhi', 'Goa'][i], country: 'India', rating: 3 + (i % 3) });
  }
  for (let i = 0; i < 3; i += 1) {
    await call('POST', '/api/quotations', token, {
      clientName: ['Aarav Mehta & Family', 'Priya Nair', 'Meera Iyer'][i], destination: places[i], duration: '5 Nights / 6 Days', paxDetails: '2 Adults', quotationType: 'Package', status: ['Draft', 'Sent', 'Confirmed'][i],
      itinerary: [{ dayNumber: 'Day 01', title: 'Arrival & Welcome', description: 'Arrival, meet & greet and transfer to the hotel.' }, { dayNumber: 'Day 02', title: 'City tour', description: 'Full day guided sightseeing.' }],
      pricing: { totalCostPerPerson: 45000 + i * 5000, grandTotal: (45000 + i * 5000) * 2 }
    });
  }
  console.log('Added sample guests, suppliers and quotations.');
};

if (await waitForApi()) {
  await seed().catch((error) => console.log(`Sample data was not added: ${error.message}`));
  console.log(`
==================================================================
  The 7Heaven CRM is running on this computer
  Open:      http://localhost:5173
  Admin:     ${ADMIN.email}   /  ${ADMIN.password}
  Team:      sana@7heaven.local (Sales), omar@7heaven.local (Ops),
             vera@7heaven.local (Viewer)   /  ${TEAM_PASSWORD}
  Database:  private, kept in .local-db/ (never the live data)
  Stop:      Ctrl+C       Start clean:  npm run dev:local -- --fresh
==================================================================`);
} else {
  console.log('The API did not start within 90 seconds; see the messages above.');
}
