import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// The Visas section lists the visa quotations only, and finds them by destination, country, client, number or phone.
// Saving a phone number from the "share" window must change only the number.

let app;
let admin;
let sales;
let viewer;

const api = (path, opts = {}) => app.call(`/api/quotations${path}`, opts);
const make = async (over) => (await api('', { method: 'POST', token: admin.token, json: { clientName: 'Aarav Mehta', destination: 'JAPAN TOURIST VISA', quotationType: 'Visa', ...over } })).body;
const fee = (over = {}) => ({ label: 'Visa fee', amount: 6500, per: 'applicant', ...over });
const visa = (over = {}) => ({ country: 'Japan', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', applicants: 2, ...over });
const list = async (query, who = admin) => (await api(`?${query}`, { token: who.token })).body;
const titles = (body) => body.data.map((q) => q.destination).sort();

let japan;
before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
  sales = await app.makeUser('Sales');
  viewer = await app.makeUser('Viewer');
  japan = (await make({ clientName: 'Meera Iyer', clientPhone: '+91 98765 43210', clientEmail: 'meera@example.com', paxDetails: '2 Adults', duration: '7 Nights / 8 Days', visa: visa(), visaFees: [fee()], visaDocuments: ['Passport'] })).data;
  await make({ destination: 'EUROPE TRIP VISA', clientName: 'Rohan Kulkarni', visa: visa({ country: 'France', visaType: 'Schengen' }), visaFees: [fee()] }); // the title does not say France
  await make({ destination: 'DUBAI VISA', clientName: 'Sana Khan', visa: visa({ country: 'United Arab Emirates' }), visaFees: [fee()] });
  await make({ destination: 'JAPAN PACKAGE', quotationType: 'Package', clientName: 'Package Guest' }); // matches "japan" but is not a visa
  await make({ destination: 'JAPAN HOTEL', quotationType: 'Only Hotel', clientName: 'Hotel Guest' });
});
after(async () => {
  await app.close();
});

test('asking for visa quotations returns only visa quotations, never the packages or hotels', async () => {
  const body = await list('quotationType=Visa');
  assert.equal(body.success, true);
  assert.deepEqual(titles(body), ['DUBAI VISA', 'EUROPE TRIP VISA', 'JAPAN TOURIST VISA']);
  assert.ok(body.data.every((q) => q.quotationType === 'Visa'));
});

test('without the type the list is unchanged: every quotation is there', async () => {
  const body = await list('');
  assert.equal(body.data.length, 5);
});

test('searching a destination inside the visa quotations skips the package that has the same word', async () => {
  assert.deepEqual(titles(await list('quotationType=Visa&search=japan')), ['JAPAN TOURIST VISA']);
  assert.deepEqual(titles(await list('search=japan')), ['JAPAN HOTEL', 'JAPAN PACKAGE', 'JAPAN TOURIST VISA'], 'the general search still finds all three');
});

test('a visa is found by its country even when the title was typed differently, and by its kind of visa', async () => {
  assert.deepEqual(titles(await list('quotationType=Visa&search=france')), ['EUROPE TRIP VISA']);
  assert.deepEqual(titles(await list('quotationType=Visa&search=schengen')), ['EUROPE TRIP VISA']);
  assert.deepEqual(titles(await list('quotationType=Visa&search=emirates')), ['DUBAI VISA']);
});

test('a visa is found by client, quotation number, phone or e-mail', async () => {
  assert.deepEqual(titles(await list('quotationType=Visa&search=meera')), ['JAPAN TOURIST VISA']);
  assert.deepEqual(titles(await list(`quotationType=Visa&search=${encodeURIComponent(japan.quotationNo)}`)), ['JAPAN TOURIST VISA']);
  assert.deepEqual(titles(await list('quotationType=Visa&search=98765')), ['JAPAN TOURIST VISA']);
  assert.deepEqual(titles(await list('quotationType=Visa&search=meera@example')), ['JAPAN TOURIST VISA']);
});

test('nothing found is an empty list, not an error; odd characters are only text', async () => {
  const none = await list('quotationType=Visa&search=atlantis');
  assert.equal(none.success, true);
  assert.deepEqual(none.data, []);
  for (const odd of ['(', '.*', '[', '\\', '$ne', '%00']) {
    const body = await list(`quotationType=Visa&search=${encodeURIComponent(odd)}`);
    assert.equal(body.success, true, `search "${odd}" must not break the list`);
  }
});

test('the type cannot be turned into a database operator', async () => {
  const body = await list('quotationType[$ne]=Visa');
  assert.equal(body.success, true);
  assert.equal(body.data.length, 5, 'an object instead of a word is ignored, so nothing is filtered (and nothing leaks differently)');
  const unknown = await list('quotationType=Spaceship');
  assert.deepEqual(unknown.data, []);
});

test('someone who may only read can open the Visas section list', async () => {
  const body = await list('quotationType=Visa', viewer);
  assert.equal(body.success, true);
  assert.equal(body.data.length, 3);
});

test('saving a phone number from the share window changes only the number: the visa, fees and documents stay', async () => {
  const put = await api(`/${japan._id}`, { method: 'PUT', token: admin.token, json: { clientPhone: '+91 99999 11111' } });
  assert.equal(put.body.success, true, put.body.message);
  const after = (await api(`/${japan._id}`, { token: admin.token })).body.data;
  assert.equal(after.clientPhone, '+91 99999 11111');
  assert.equal(after.visa.country, 'Japan');
  assert.deepEqual(after.visaFees.map((f) => [f.label, f.amount]), [['Visa fee', 6500]]);
  assert.deepEqual(after.visaDocuments, ['Passport']);
  assert.equal(after.clientName, 'Meera Iyer');
  assert.equal(after.duration, '7 Nights / 8 Days');
});

test('sales staff can save a number on their own visa quotation, but not on a colleague\'s (the window offers saving only where it is allowed)', async () => {
  // As an Admin does on the Rights screen: Sales may create and change quotations (but not edit other people's).
  const grant = await app.call('/api/rights/bulk', { method: 'POST', token: admin.token, json: { userRole: 'Sales', permissions: { quotations: { canRead: true, canCreate: true, canUpdate: true } } } });
  assert.equal(grant.body.success, true, grant.body.message);
  const made = (await api('', { method: 'POST', token: sales.token, json: { clientName: 'Own Client', destination: 'OWN VISA', quotationType: 'Visa', visa: visa(), visaFees: [fee()] } })).body;
  assert.equal(made.success, true, made.message);
  const mine = made.data;
  const ok = await api(`/${mine._id}`, { method: 'PUT', token: sales.token, json: { clientPhone: '+91 90000 00001' } });
  assert.equal(ok.body.success, true, ok.body.message);
  const denied = await api(`/${japan._id}`, { method: 'PUT', token: sales.token, json: { clientPhone: '+91 1' } });
  assert.equal(denied.body.success, false);
  assert.match(denied.body.message, /not authorized to modify .* other members/);
  assert.equal((await api(`/${japan._id}`, { token: admin.token })).body.data.clientPhone, '+91 99999 11111', 'the colleague\'s number was not touched');
});

test('a viewer cannot change a quotation, so the share window cannot save a number for them', async () => {
  const put = await api(`/${japan._id}`, { method: 'PUT', token: viewer.token, json: { clientPhone: '+91 1' } });
  assert.equal(put.body.success, false);
  assert.match(put.body.message, /Permission Denied/);
  assert.equal((await api(`/${japan._id}`, { token: admin.token })).body.data.clientPhone, '+91 99999 11111');
});

test('a visa quotation never gets a trip nobody typed; other types keep their usual starting values', async () => {
  const plain = await make({ destination: 'NO TRIP VISA', clientName: 'Plain Client', visa: visa(), visaFees: [fee()] });
  assert.equal(plain.success, true, plain.message);
  assert.equal(plain.data.duration, '', 'the visa prints its duration, so it is empty until someone types it');
  assert.equal(plain.data.paxDetails, '');
  const typed = (await make({ destination: 'TYPED VISA', clientName: 'Typed Client', duration: '10 Nights', paxDetails: '4 Adults', visa: visa(), visaFees: [fee()] })).data;
  assert.equal(typed.duration, '10 Nights');
  assert.equal(typed.paxDetails, '4 Adults');
  const pkg = (await make({ destination: 'BALI', clientName: 'Package Client', quotationType: 'Package' })).data;
  assert.equal(pkg.duration, '3 Nights / 4 Days');
  assert.equal(pkg.paxDetails, '3 Adults');
});
