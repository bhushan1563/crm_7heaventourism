import { startDbApp, fakeImage, photoForm, mediaPath } from './helpers-db.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { page, startSite } from '../helpers-sites.js';

// The hotel finder through the real app: rights, finds against pretend sites, the picture route, and saved finds in a real database.
process.env.FINDER_ALLOW_PRIVATE = '1'; // tests only: lets the finder read pretend sites on this computer (never honoured in production)

let app;
let admin;
let sales;
let ops;
let viewer;
let site;
let hits;

const finder = (path, opts = {}) => app.call(`/api/hotel-finder${path}`, opts);
const find = (token, json) => finder('/find', { method: 'POST', token, json });

const HOME = page('Palm Grove Resort - Goa | Official Site', `
  <h1>Palm Grove Resort</h1>
  <p>Palm Grove Resort is a four-star beachside resort in North Goa with 60 rooms, two pools and a spa. Guests love the sunsets and the seafood.</p>
  <p>Check-in: 2 PM | Check-out: 11 AM</p>
  <img src="/pics/room.jpg" width="1200" height="800" alt="Sea view room">
  <img src="/pics/bad.jpg" width="1200" height="800" alt="Not a picture">
  <img src="/pics/big.png" width="1200" height="800" alt="Huge">
  <a href="/contact">Contact</a> <a href="/rooms">Rooms</a>`);
const CONTACT = page('Contact', '<h1>Contact</h1><p>Address: 12 Candolim Beach Road, Candolim, Goa 403515, India</p><p>Call us: <a href="tel:+918322275599">+91 832 227 5599</a></p><p>Email: <a href="mailto:stay@palmgrove.example">stay@palmgrove.example</a></p>');
const ROOMS = page('Rooms', '<h2>Sea View Room</h2><p>A bright air-conditioned room facing the sea, with a balcony.</p><p>From ₹6,500 per night</p>');

before(async () => {
  app = await startDbApp();
  [admin, sales, ops, viewer] = await Promise.all(['Admin', 'Sales', 'Ops', 'Viewer'].map((r) => app.makeUser(r)));
  hits = { home: 0 };
  const jpeg = fakeImage.jpeg(1200, 800, 3000);
  site = await startSite({
    '/': (req, res) => { hits.home += 1; res.writeHead(200, { 'content-type': 'text/html' }); res.end(HOME); },
    '/contact': { body: CONTACT },
    '/rooms': { body: ROOMS },
    '/pics/room.jpg': { headers: { 'content-type': 'image/jpeg' }, body: jpeg },
    '/pics/bad.jpg': { headers: { 'content-type': 'image/jpeg' }, body: '<html>this is not a picture</html>' },
    '/pics/big.png': { headers: { 'content-type': 'image/png' }, body: fakeImage.png(7000, 6000) },
    '/pics/slow-site.jpg': { headers: { 'content-type': 'image/jpeg' }, body: jpeg },
    '/forbidden': { status: 403, body: 'no' },
    '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /secret' },
    '/secret': { body: HOME }
  });
});
after(async () => {
  await site.close();
  await app.close();
});

// ---- rights ----

test('rights: finding needs "create" on hotels; a viewer cannot find but can read saved finds; no sign-in is refused', async () => {
  const denied = await find(viewer.token, { url: site.origin });
  assert.equal(denied.body.success, false);
  assert.match(denied.body.message, /Permission Denied/);
  const anon = await finder('/find', { method: 'POST', json: { url: site.origin } });
  assert.equal(anon.status, 401);
  const list = await finder('/saved', { token: viewer.token });
  assert.equal(list.body.success, true);
  const created = await finder('/saved', { method: 'POST', token: viewer.token, json: { name: 'X' } });
  assert.equal(created.body.success, false);
  assert.match(created.body.message, /Permission Denied/);
  assert.equal((await finder('/saved/not-an-id', { token: sales.token })).body.success, false);
});

// ---- finds ----

test('a find through the API: the hotel, how sure each fact is, the pages read, and pictures behind our own address', async () => {
  const r = await find(sales.token, { url: `${site.origin}/`, fresh: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true, r.body.message);
  const { hotel, completeness, pages, fieldInfo } = r.body.data;
  assert.equal(hotel.name, 'Palm Grove Resort');
  assert.equal(hotel.starRating, '4 star');
  assert.equal(hotel.address.locality, 'Candolim');
  assert.equal(hotel.phones[0].display, '+91 832 227 5599');
  assert.deepEqual(hotel.emails, ['stay@palmgrove.example']);
  assert.equal(hotel.checkIn, '14:00');
  assert.equal(hotel.checkOut, '11:00');
  assert.equal(hotel.rates.from, 6500);
  assert.ok(completeness.score > 40 && fieldInfo.name.level);
  assert.deepEqual(pages.map((p) => p.kind).sort(), ['contact', 'rooms', 'start']);
  const picture = hotel.images.find((i) => i.url.endsWith('/pics/room.jpg'));
  assert.match(picture.preview, /^\/finder-image\/[\w-]+\.[\w-]+$/);
  assert.ok(site.requests.every((q) => /7HeavenHotelFinder/.test(q.headers['user-agent'])));
});

test('the same address asked again is answered from memory, unless a fresh read is asked for', async () => {
  const before = hits.home;
  const a = await find(sales.token, { url: `${site.origin}/` });
  assert.equal(a.body.success, true);
  assert.equal(hits.home, before, 'no new visit to the website');
  assert.equal(a.body.data.fromMemory, true);
  const b = await find(sales.token, { url: `${site.origin}/`, fresh: true });
  assert.equal(hits.home, before + 1, 'a fresh read visits the website again');
  assert.equal(b.body.data.fromMemory, undefined);
});

test('one search at a time for each person: a second one started meanwhile is told to wait', async () => {
  const slow = await startSite({ '/': { delayMs: 600, body: HOME } });
  try {
    const first = find(ops.token, { url: `${slow.origin}/`, fresh: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const second = await find(ops.token, { url: `${slow.origin}/other`, fresh: true });
    assert.equal(second.body.success, false);
    assert.equal(second.body.code, 'BUSY');
    assert.match(second.body.message, /already have a search running/);
    assert.equal((await first).body.success, true);
    const after = await find(ops.token, { url: `${slow.origin}/`, fresh: true });
    assert.equal(after.body.success, true, 'free again once the first one is finished');
  } finally {
    await slow.close();
  }
});

test('every kind of trouble comes back as a message in words with a code, and says whether pasting could help', async () => {
  const cases = [
    [{ url: '' }, 'BAD_URL', false],
    [{ url: 'not a web address' }, 'BAD_URL', false],
    [{ url: 'javascript:alert(1)' }, 'BAD_URL', false],
    [{ }, 'BAD_URL', false],
    [{ url: 42 }, 'BAD_URL', false],
    [{ url: `${site.origin}/forbidden`, fresh: true }, 'BLOCKED_BY_SITE', true],
    [{ url: `${site.origin}/secret`, fresh: true }, 'ROBOTS_DISALLOWED', true],
    [{ url: `${site.origin}/no-such-page`, fresh: true }, 'NOT_FOUND', false]
  ];
  for (const [json, code, canPaste] of cases) {
    const r = await find(sales.token, json);
    assert.equal(r.status, 200, JSON.stringify(json));
    assert.equal(r.body.success, false, JSON.stringify(json));
    assert.equal(r.body.code, code, `${JSON.stringify(json)}: ${r.body.message}`);
    assert.equal(r.body.canPaste, canPaste, JSON.stringify(json));
    assert.ok(r.body.message.length > 20);
  }
});

test('find from pasted text', async () => {
  const text = 'Palm Grove Resort\nPalm Grove Resort is a four-star beachside resort in North Goa with sixty rooms, two pools and a spa.\nContact\nAddress: 12 Candolim Beach Road, Candolim, Goa 403515, India\nCall us: +91 832 227 5599\nCheck-in: 2 PM | Check-out: 11 AM';
  const r = await finderText(sales.token, { text });
  assert.equal(r.body.success, true, r.body.message);
  assert.equal(r.body.data.hotel.name, 'Palm Grove Resort');
  assert.equal(r.body.data.source, 'pasted');
  for (const [json, code] of [[{}, 'EMPTY_TEXT'], [{ text: 'short' }, 'TEXT_TOO_SHORT'], [{ text, url: 'http://169.254.169.254/' }, undefined]]) {
    const bad = await finderText(sales.token, json);
    if (code) assert.equal(bad.body.code, code);
  }
  assert.equal((await finderText(viewer.token, { text })).body.success, false);
  const huge = await finderText(sales.token, { text: 'x'.repeat(900_000) });
  assert.equal(huge.body.code, 'TEXT_TOO_LONG');
});
const finderText = (token, json) => finder('/find-text', { method: 'POST', token, json });

// ---- pictures ----

const ticketOf = async (suffix = '/pics/room.jpg') => {
  const r = await find(sales.token, { url: `${site.origin}/` });
  const picture = r.body.data.hotel.images.find((i) => i.url.endsWith(suffix));
  return picture?.preview;
};

test('a picture is fetched for the page through our address, as the kind of picture it really is', async () => {
  const preview = await ticketOf();
  assert.ok(preview);
  const r = await app.call(preview);
  assert.equal(r.status, 200);
  assert.equal(r.res.headers.get('content-type'), 'image/jpeg');
  assert.equal(r.res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.res.headers.get('content-security-policy'), /sandbox/);
  assert.ok(r.bytes.length > 3000);
  assert.deepEqual([...r.bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(site.requests.filter((q) => q.path === '/pics/room.jpg').every((q) => q.headers.referer === site.origin), 'asked as a browser on the hotel\'s page would');
});

test('a picture that is not one, or is far too large, is never passed on', async () => {
  const bad = await ticketOf('/pics/bad.jpg');
  assert.equal((await app.call(bad)).status, 404);
  const big = await ticketOf('/pics/big.png');
  assert.equal((await app.call(big)).status, 404, '42 million pixels is more than the limit');
});

test('the picture route is not an open proxy: forged, changed, expired or made-up tickets get nothing', async () => {
  const good = await ticketOf();
  const [payload, tag] = good.replace('/finder-image/', '').split('.');
  assert.equal((await app.call(`/finder-image/${payload}.${'A'.repeat(tag.length)}`)).status, 404, 'wrong signature');
  const changed = Buffer.from(JSON.stringify({ u: 'http://127.0.0.1:1/internal', r: '', e: 9999999999 })).toString('base64url');
  assert.equal((await app.call(`/finder-image/${changed}.${tag}`)).status, 404, 'another address under the old signature');
  for (const bad of ['garbage', 'a.b', 'a.b.c', `${payload}`, 'x'.repeat(4000)]) assert.equal((await app.call(`/finder-image/${bad}`)).status, 404, bad);
  const { signImageTicket } = await import('../../src/services/hotelFinder/imageToken.js');
  const old = signImageTicket({ url: `${site.origin}/pics/room.jpg`, referer: '' }, app.config.jwtSecret, Date.now() - 2 * 3600 * 1000);
  assert.equal((await app.call(`/finder-image/${old}`)).status, 410, 'an hour-old ticket has expired');
  const ok = signImageTicket({ url: `${site.origin}/pics/room.jpg`, referer: '' }, app.config.jwtSecret);
  assert.equal((await app.call(`/finder-image/${ok}`)).status, 200);
  const other = signImageTicket({ url: `${site.origin}/pics/room.jpg`, referer: '' }, 'a different secret');
  assert.equal((await app.call(`/finder-image/${other}`)).status, 404, 'signed with another secret');
});

// ---- saved finds ----

const photo = async (token, w) => (await app.call(mediaPath('hotel'), { method: 'POST', token, form: photoForm({ image: fakeImage.jpeg(w, 600, w) }) })).body.data;
const saved = (path, opts = {}) => finder(`/saved${path}`, opts);
const make = (over = {}) => ({
  name: 'Palm Grove Resort', propertyType: 'Resort', starRating: '4 star', description: 'A beachside resort.\n\nTwo pools.', address: { full: '12 Candolim Beach Road, Candolim, Goa 403515, India', street: '12 Candolim Beach Road', locality: 'Candolim', region: 'Goa', postalCode: '403515', country: 'India' },
  geo: { lat: 15.5, lng: 73.76 }, phones: ['+91 832 227 5599'], emails: ['Stay@PalmGrove.example'], website: 'palmgrove.example', social: [{ network: 'Facebook', url: 'https://www.facebook.com/palmgrove' }], checkIn: '14:00', checkOut: '11:00',
  amenities: ['Pool', 'pool', 'Spa'], rooms: [{ name: 'Sea View Room', details: 'A bright room.' }], rates: { currency: 'inr', from: 6500, to: 9000, unit: 'night', text: 'From Rs 6,500 per night', note: 'As printed.', lines: [] },
  guestRating: { value: 4.5, best: 5, count: 120 }, policies: { cancellation: 'Free until 7 days before.' }, sourceUrl: 'https://palmgrove.example/', source: 'website', completeness: { score: 71, found: ['name'], missing: ['pictures'] }, warnings: ['Check the rates.'], pagesRead: [{ url: 'https://palmgrove.example/', label: 'The address you gave' }], fieldLevels: { name: 'high', phones: 'medium', bogus: 'purple' }, ...over
});

test('save a find: it is stored tidily, with the finder\'s notes about it, and photo sizes from the server', async () => {
  const p = await photo(sales.token, 1101);
  const r = await saved('', { method: 'POST', token: sales.token, json: make({ photos: [{ token: p.token, caption: '<b>Front</b>', width: 1, height: 1 }] }) });
  assert.equal(r.body.success, true, r.body.message);
  const d = r.body.data;
  assert.equal(d.name, 'Palm Grove Resort');
  assert.equal(d.emails[0], 'stay@palmgrove.example');
  assert.equal(d.website, 'https://palmgrove.example');
  assert.deepEqual(d.amenities, ['Pool', 'Spa']);
  assert.equal(d.rates.currency, 'INR');
  assert.deepEqual(d.social, [{ network: 'facebook', url: 'https://www.facebook.com/palmgrove' }]);
  assert.equal(d.sourceSite, 'palmgrove.example');
  assert.equal(d.photos[0].width, p.width, 'the size comes from the stored photo');
  assert.equal(d.status, 'Saved');
  assert.equal(d.createdBy, String(sales.user._id));
  assert.deepEqual(d.fieldLevels, { name: 'high', phones: 'medium' }, 'an unknown level is dropped');
  assert.equal(d.nameKey, undefined);
  assert.equal(d.description, 'A beachside resort.\n\nTwo pools.');
});

test('saving the same hotel twice is refused in words; saving needs a name and good values', async () => {
  const dup = await saved('', { method: 'POST', token: ops.token, json: make({ name: ' palm  grove resort ' }) });
  assert.equal(dup.body.success, false);
  assert.match(dup.body.message, /"Palm Grove Resort" in Candolim is already saved in Found hotels/);
  const bad = [
    [{ name: '' }, /Please enter the name of the hotel/],
    [{ name: 'A', starRating: 'six star' }, /Please choose the rating from the list/],
    [{ name: 'A', emails: ['nope'] }, /does not look right/],
    [{ name: 'A', phones: ['abc'] }, /may only contain digits/],
    [{ name: 'A', geo: { lat: 200, lng: 0 } }, /map position/],
    [{ name: 'A', checkIn: '25:00' }, /check-in time must be a time like 14:00/],
    [{ name: 'A', website: 'not a site' }, /does not look like a web address/],
    [{ name: 'A', rooms: [{ name: 'X' }, { name: 'x' }] }, /listed twice/],
    [{ name: 'A', guestRating: { value: 9, best: 5 } }, /guest rating/],
    [{ name: 'A', photos: [{ token: 'short' }] }, /not valid/],
    [{ name: 'A', photos: [{ token: 'A'.repeat(24) }] }, /no longer available/],
    [{ name: 'A'.repeat(200) }, /too long/]
  ];
  for (const [over, message] of bad) {
    const r = await saved('', { method: 'POST', token: sales.token, json: { ...over } });
    assert.equal(r.body.success, false, JSON.stringify(over).slice(0, 80));
    assert.match(r.body.message, message, JSON.stringify(over).slice(0, 80));
  }
  assert.equal((await saved('', { method: 'POST', token: sales.token, json: ['not', 'an', 'object'] })).body.success, false);
});

test('list, search, filter, open: the saved finds', async () => {
  await saved('', { method: 'POST', token: sales.token, json: make({ name: 'Blue Lagoon Inn', address: { full: '', street: '', locality: 'Alibag', region: '', postalCode: '', country: 'India' }, sourceUrl: 'https://bluelagoon.example/', amenities: ['Kayaking'] }) });
  const all = await saved('?sort=name', { token: viewer.token });
  assert.equal(all.body.success, true);
  assert.deepEqual(all.body.data.map((x) => x.name), ['Blue Lagoon Inn', 'Palm Grove Resort']);
  assert.equal(all.body.total, 2);
  assert.ok(all.body.data[0].photoCount >= 0 && all.body.data[0].description === undefined, 'the list carries only what it shows');
  assert.deepEqual((await saved('?search=kayak', { token: sales.token })).body.data.map((x) => x.name), ['Blue Lagoon Inn']);
  assert.deepEqual((await saved('?search=candolim', { token: sales.token })).body.data.map((x) => x.name), ['Palm Grove Resort']);
  assert.deepEqual((await saved('?search=bluelagoon.example', { token: sales.token })).body.data.map((x) => x.name), ['Blue Lagoon Inn']);
  assert.equal((await saved('?search=.*', { token: sales.token })).body.total, 0, 'a search is text, not a pattern');
  assert.equal((await saved('?limit=1&page=2&sort=name', { token: sales.token })).body.data[0].name, 'Palm Grove Resort');
  assert.equal((await saved('?status=Added', { token: sales.token })).body.total, 0);
  const one = all.body.data.find((x) => x.name === 'Palm Grove Resort');
  const open = await saved(`/${one._id}`, { token: viewer.token });
  assert.equal(open.body.data.rates.from, 6500);
  assert.equal((await saved('/0123456789abcdef01234567', { token: sales.token })).body.success, false);
});

test('edit a saved find: partial updates, a changed name checked for duplicates, and two editors cannot overwrite each other', async () => {
  const list = (await saved('?sort=name', { token: sales.token })).body.data;
  const palm = list.find((x) => x.name === 'Palm Grove Resort');
  const full = (await saved(`/${palm._id}`, { token: sales.token })).body.data;
  const r = await saved(`/${palm._id}`, { method: 'PUT', token: ops.token, json: { notes: 'Call them Monday', tags: ['Beach'], updatedAt: full.updatedAt } });
  assert.equal(r.body.success, true, r.body.message);
  assert.equal(r.body.data.notes, 'Call them Monday');
  assert.deepEqual(r.body.data.tags, ['beach']);
  assert.equal(r.body.data.name, 'Palm Grove Resort', 'a field not sent is left as it was');
  assert.equal(r.body.data.updatedByName, ops.user.firstName + ' ' + ops.user.lastName);
  const stale = await saved(`/${palm._id}`, { method: 'PUT', token: sales.token, json: { notes: 'Mine', updatedAt: full.updatedAt } });
  assert.equal(stale.body.success, false);
  assert.match(stale.body.message, /was changed by .* while you were editing it/);
  const clash = await saved(`/${palm._id}`, { method: 'PUT', token: sales.token, json: { name: 'Blue Lagoon Inn', address: { locality: 'Alibag' } } });
  assert.match(clash.body.message, /already saved in Found hotels/);
  assert.equal((await saved(`/${palm._id}`, { method: 'PUT', token: sales.token, json: { emails: ['bad'] } })).body.success, false);
  assert.equal((await saved('/0123456789abcdef01234567', { method: 'PUT', token: sales.token, json: { notes: 'x' } })).body.success, false);
});

test('removing a saved find needs the delete right; it leaves the list, and the same hotel can be saved again', async () => {
  const list = (await saved('?sort=name', { token: sales.token })).body.data;
  const blue = list.find((x) => x.name === 'Blue Lagoon Inn');
  const denied = await saved(`/${blue._id}`, { method: 'DELETE', token: sales.token });
  assert.equal(denied.body.success, false);
  assert.match(denied.body.message, /Permission Denied/);
  const done = await saved(`/${blue._id}`, { method: 'DELETE', token: admin.token });
  assert.equal(done.body.success, true, done.body.message);
  assert.equal((await saved(`/${blue._id}`, { token: sales.token })).body.success, false);
  assert.deepEqual((await saved('', { token: sales.token })).body.data.map((x) => x.name), ['Palm Grove Resort']);
  const again = await saved('', { method: 'POST', token: sales.token, json: make({ name: 'Blue Lagoon Inn', address: { locality: 'Alibag' } }) });
  assert.equal(again.body.success, true, again.body.message);
});

test('adding to the hotel list: the found hotel is marked, with the hotel it became', async () => {
  const palm = (await saved('?search=palm', { token: sales.token })).body.data[0];
  const hotel = await app.call('/api/hotels', { method: 'POST', token: sales.token, json: { name: 'Palm Grove Resort', city: 'Candolim', country: 'India', starRating: '4 star' } });
  assert.equal(hotel.body.success, true, hotel.body.message);
  const marked = await saved(`/${palm._id}/added`, { method: 'POST', token: sales.token, json: { hotelId: hotel.body.data._id } });
  assert.equal(marked.body.success, true, marked.body.message);
  assert.equal(marked.body.data.status, 'Added');
  assert.equal(marked.body.data.hotelId, hotel.body.data._id);
  assert.equal((await saved('?status=Added', { token: sales.token })).body.total, 1);
  assert.match((await saved(`/${palm._id}/added`, { method: 'POST', token: sales.token, json: { hotelId: 'nope' } })).body.message, /could not be identified/);
  assert.match((await saved(`/${palm._id}/added`, { method: 'POST', token: sales.token, json: { hotelId: '0123456789abcdef01234567' } })).body.message, /not in the hotel list/);
  assert.equal((await saved(`/${palm._id}/added`, { method: 'POST', token: viewer.token, json: { hotelId: hotel.body.data._id } })).body.success, false);
});

test('photos kept by a saved find are not thrown away by the photo clean-up', async () => {
  const { getMediaSources } = await import('../../src/services/mediaSources.js');
  const sources = await getMediaSources();
  assert.ok(sources.some((s) => s.model.modelName === 'FoundHotel' && s.select === 'photos'));
});
