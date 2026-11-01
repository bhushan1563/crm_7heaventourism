import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The lines of a quotation's lists (inclusions, exclusions, policies, notes): plain or formatted, always cleaned on the server.

let app;
let admin;

const api = (path, opts = {}) => app.call(`/api/quotations${path}`, opts);
const base = (over = {}) => ({ clientName: 'Aarav Mehta', destination: 'Bali', ...over });
const create = async (over) => (await api('', { method: 'POST', token: admin.token, json: base(over) })).body;

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
});
after(async () => {
  await app.close();
});

test('plain lines saved the old way come back exactly as typed, and formatted lines are cleaned', async () => {
  const body = await create({
    exclusions: ['Monument entry fees <TBC>', '<p onclick="x()"><strong>Airfare</strong></p><script>alert(1)</script>'],
    paymentPolicy: ['25% advance at confirmation'],
    cancellationPolicy: ['30 days before: 10% fee'],
    vehicleNotes: ['AC off in ghat sections'],
    importantNotes: ['1. Valid photo ID required'],
    packageDetails: { inclusions: ['Meet & greet', '<p>Daily <mark style="background-color:#fde047">breakfast</mark></p>'] }
  });
  assert.equal(body.success, true, body.message);
  assert.deepEqual(body.data.exclusions, ['Monument entry fees <TBC>', '<p><strong>Airfare</strong></p>']);
  assert.deepEqual(body.data.paymentPolicy, ['25% advance at confirmation']);
  assert.deepEqual(body.data.importantNotes, ['1. Valid photo ID required']);
  assert.deepEqual(body.data.packageDetails.inclusions, ['Meet & greet', '<p>Daily <mark style="background-color:#fde047">breakfast</mark></p>']);
});

test('hostile lines are neutralised on the server, whatever the browser sent', async () => {
  const body = await create({ vehicleNotes: ['<p><img src=x onerror=alert(1)>hi</p>', '<p style="position:fixed;font-size:9999px">big</p>'], packageDetails: { inclusions: ['<p>ok</p><script>steal()</script>', '<script>steal()</script> typed as plain text'] } });
  assert.equal(body.success, true, body.message);
  // Formatted text (it starts with a paragraph or list) is cleaned of anything that could run.
  assert.doesNotMatch(JSON.stringify([body.data.vehicleNotes, body.data.packageDetails.inclusions[0]]), /<script|<img|onerror|position|9999px/i);
  assert.equal(body.data.packageDetails.inclusions[0], '<p>ok</p>');
  // Anything else is plain text: kept exactly as typed, and always shown as text (never as markup).
  assert.equal(body.data.packageDetails.inclusions[1], '<script>steal()</script> typed as plain text');
});

test('an update without the lists leaves them alone; sending them replaces them; blank lines are dropped; a refused update changes nothing', async () => {
  const made = await create({ exclusions: ['One', 'Two'], packageDetails: { inclusions: ['Breakfast'] } });
  const id = made.data._id;
  const statusOnly = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { status: 'Sent' } });
  assert.deepEqual(statusOnly.body.data.exclusions, ['One', 'Two']);
  assert.deepEqual(statusOnly.body.data.packageDetails.inclusions, ['Breakfast']);

  const replaced = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { exclusions: ['Only', '', '  '], packageDetails: { inclusions: ['<p><strong>Transfers</strong></p>'] } } });
  assert.equal(replaced.body.success, true, replaced.body.message);
  assert.deepEqual(replaced.body.data.exclusions, ['Only']);
  assert.deepEqual(replaced.body.data.packageDetails.inclusions, ['<p><strong>Transfers</strong></p>']);

  const refused = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { exclusions: ['fine', 'x'.repeat(1500)] } });
  assert.equal(refused.body.success, false);
  assert.match(refused.body.message, /The exclusions, item 2/);
  assert.deepEqual((await api(`/${id}`, { token: admin.token })).body.data.exclusions, ['Only']);
});

test('lines, itinerary days and hotel stays are all cleaned in the same save, and package details that were not touched stay', async () => {
  const body = await create({
    itinerary: [{ title: 'Day', description: '<p>x<script>1</script></p>' }],
    packageDetails: { hotels: [{ hotelName: 'Hotel Rivatas', city: 'Varanasi' }], roomInfo: '1 Room' },
    importantNotes: ['<p><b>Note</b></p>']
  });
  assert.equal(body.success, true, body.message);
  assert.equal(body.data.itinerary[0].description, '<p>x</p>');
  assert.deepEqual(body.data.importantNotes, ['<p><strong>Note</strong></p>']);
  assert.equal(body.data.packageDetails.hotels.length, 1);
  assert.equal(body.data.packageDetails.roomInfo, '1 Room');
});

test('a quotation made before any of this (nothing but plain defaults) is saved and read back unchanged', async () => {
  const legacy = {
    exclusions: ['Airfare', 'Personal expenses'],
    paymentPolicy: ['25% Advance token payment at confirmation'],
    cancellationPolicy: ['30 days or more prior to departure: 10% cancellation fee'],
    vehicleNotes: ['AC will be switched off in ghat sections'],
    importantNotes: ['Standard check-in 12:00 PM'],
    packageDetails: { roomInfo: '2 Rooms', inclusions: ['Meet and greet assistance on arrival & departure'] }
  };
  const body = await create(legacy);
  assert.equal(body.success, true, body.message);
  for (const key of ['exclusions', 'paymentPolicy', 'cancellationPolicy', 'vehicleNotes', 'importantNotes']) assert.deepEqual(body.data[key], legacy[key], key);
  assert.deepEqual(body.data.packageDetails.inclusions, legacy.packageDetails.inclusions);
});
