import { startDbApp } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// Visa quotations: documents checklist, fees and visa details. Other quotation types are unchanged.

let app;
let admin;

const api = (path, opts = {}) => app.call(`/api/quotations${path}`, opts);
const base = (over = {}) => ({ clientName: 'Aarav Mehta', destination: 'UNITED ARAB EMIRATES', quotationType: 'Visa', ...over });
const create = async (over) => (await api('', { method: 'POST', token: admin.token, json: base(over) })).body;
const fee = (over = {}) => ({ label: 'Visa fee', amount: 6500, per: 'applicant', ...over });
const visa = (over = {}) => ({ country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days', applicants: 3, priceNote: 'Fees may change without notice', ...over });
const pricing = (over = {}) => ({ items: [], totalCostPerPerson: 9, grandTotal: 999, currency: 'Rs', notes: 'kept', ...over });

before(async () => {
  app = await startDbApp();
  admin = await app.makeUser('Admin');
});
after(async () => {
  await app.close();
});

test('a visa quotation is saved with its details, fees, documents checklist and inclusions', async () => {
  const body = await create({
    visa: visa(),
    visaFees: [fee(), fee({ label: 'Service charge', amount: 1500 }), fee({ label: 'Courier', amount: 800, per: 'group' })],
    visaDocuments: ['Passport valid for 6 months', '<p onclick="x()"><strong>Passport-size photographs</strong></p><script>alert(1)</script>', 'Bank statement of the last 3 months'],
    visaInclusions: ['Form filling', 'Document check'],
    pricing: pricing()
  });
  assert.equal(body.success, true, body.message);
  const d = body.data;
  assert.equal(d.quotationType, 'Visa');
  assert.deepEqual([d.visa.country, d.visa.visaType, d.visa.entryType, d.visa.mode, d.visa.processingTime, d.visa.applicants], ['United Arab Emirates', 'Tourist', 'Single entry', 'e-Visa', '3 to 5 working days', 3]);
  assert.deepEqual(d.visaFees.map((f) => [f.label, f.amount, f.per]), [['Visa fee', 6500, 'applicant'], ['Service charge', 1500, 'applicant'], ['Courier', 800, 'group']]);
  assert.deepEqual(d.visaDocuments, ['Passport valid for 6 months', '<p><strong>Passport-size photographs</strong></p>', 'Bank statement of the last 3 months'], 'plain lines kept, formatted lines cleaned');
  assert.deepEqual(d.visaInclusions, ['Form filling', 'Document check']);
});

test('the amount lists and statistics read always equals the fee total (and the rest of the pricing is kept)', async () => {
  const body = await create({ visa: visa({ applicants: 3 }), visaFees: [fee(), fee({ label: 'Service charge', amount: 1500 }), fee({ label: 'Courier', amount: 800, per: 'group' })], pricing: pricing() });
  assert.equal(body.data.pricing.grandTotal, 3 * 6500 + 3 * 1500 + 800, 'not the 999 the browser sent');
  assert.equal(body.data.pricing.totalCostPerPerson, 0);
  assert.equal(body.data.pricing.totalCostNote, 'Rs 24,800 total');
  assert.equal(body.data.pricing.notes, 'kept');
  const changed = await api(`/${body.data._id}`, { method: 'PUT', token: admin.token, json: { quotationType: 'Visa', visa: visa({ applicants: 5 }), visaFees: [fee()], pricing: pricing({ grandTotal: 1 }) } });
  assert.equal(changed.body.data.pricing.grandTotal, 32500);
  assert.equal((await api('/stats', { token: admin.token })).body.success, true);
});

test('problems are explained in plain language, name the fee, and nothing is saved', async () => {
  const before = (await api('', { token: admin.token })).body.count;
  const cases = [
    [{ visa: visa({ entryType: 'Whenever' }) }, /Please choose the entry type from the list/],
    [{ visa: visa({ applicants: 0 }) }, /number of applicants must be a whole number from 1 to 99/],
    [{ visa: visa(), visaFees: [fee({ label: '' })] }, /Please enter a name for fee 1/],
    [{ visa: visa(), visaFees: [fee(), fee({ amount: -1 })] }, /amount of fee 2 must be from 0 to/],
    [{ visa: visa(), visaFees: [fee({ per: 'family' })] }, /fee 1 is per applicant or for the whole group/],
    [{ visa: 'UAE' }, /The visa details must be a set of fields/],
    [{ visa: visa(), visaDocuments: ['ok', 'x'.repeat(1500)] }, /The documents checklist, item 2/]
  ];
  for (const [over, message] of cases) {
    const body = await create({ pricing: pricing(), ...over });
    assert.equal(body.success, false, JSON.stringify(over).slice(0, 70));
    assert.match(body.message, message);
  }
  assert.equal((await api('', { token: admin.token })).body.count, before);
});

test('an update without visa fields leaves them and the amount alone; sending them replaces them; a refused update changes nothing', async () => {
  const made = await create({ visa: visa({ applicants: 2 }), visaFees: [fee()], visaDocuments: ['Passport'], pricing: pricing() });
  const id = made.data._id;
  const statusOnly = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { status: 'Sent' } });
  assert.equal(statusOnly.body.data.visaFees.length, 1);
  assert.equal(statusOnly.body.data.pricing.grandTotal, 13000);
  assert.equal(statusOnly.body.data.visa.country, 'United Arab Emirates');
  assert.deepEqual(statusOnly.body.data.visaDocuments, ['Passport']);

  const refused = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { quotationType: 'Visa', visa: visa(), visaFees: [fee({ amount: 'lots' })], pricing: pricing() } });
  assert.equal(refused.body.success, false);
  assert.equal((await api(`/${id}`, { token: admin.token })).body.data.visaFees[0].amount, 6500);

  const emptied = await api(`/${id}`, { method: 'PUT', token: admin.token, json: { visaDocuments: [] } });
  assert.deepEqual(emptied.body.data.visaDocuments, [], 'an emptied checklist is a real change');
});

test('other quotation types are untouched: no visa fields, and their own pricing is never overwritten', async () => {
  const body = await create({ quotationType: 'Package', visa: visa(), visaFees: [fee()], pricing: pricing({ grandTotal: 77777, totalCostPerPerson: 25000 }) });
  assert.equal(body.success, true, body.message);
  assert.equal(body.data.pricing.grandTotal, 77777, 'visa fees on a non-visa quotation do not touch its price');
  const plain = await create({ quotationType: 'Package' });
  const read = await api(`/${plain.data._id}`, { token: admin.token });
  assert.deepEqual([read.body.data.visaFees, read.body.data.visaDocuments, read.body.data.visaInclusions], [[], [], []]);
  assert.equal(read.body.data.visa.applicants, 1);
});

test('duplicating a visa quotation keeps everything', async () => {
  const made = await create({ visa: visa(), visaFees: [fee()], visaDocuments: ['Passport'], visaInclusions: ['Form filling'], pricing: pricing() });
  const copy = await api(`/${made.data._id}/duplicate`, { method: 'POST', token: admin.token });
  assert.equal(copy.body.success, true, copy.body.message);
  assert.equal(copy.body.data.quotationType, 'Visa');
  assert.equal(copy.body.data.visa.visaType, 'Tourist');
  assert.equal(copy.body.data.visaFees[0].label, 'Visa fee');
  assert.deepEqual(copy.body.data.visaDocuments, ['Passport']);
});
