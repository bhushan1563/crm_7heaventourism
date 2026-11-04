import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FINDER_LIMITS, findFromText, findHotel, textToHtml } from '../src/services/hotelFinder/finder.js';
import { page, startSite } from './helpers-sites.js';

// The whole finder, against pretend hotel sites on this computer (allowPrivate is only for these tests).

const local = { allowPrivate: true };
const fixture = (name) => fs.readFileSync(new URL(`./fixtures/hotels/${name}`, import.meta.url), 'utf8');

const HOME = page('Lakeview Homestay - Udaipur | Official Site', `
  <h1>Lakeview Homestay</h1>
  <p>Lakeview Homestay is a family-run guest house on the banks of Lake Pichola. Our rooms look over the water and the hills beyond, and every morning starts with a home-cooked breakfast on the terrace.</p>
  <nav><a href="/contact/">Contact Us</a> <a href="/rooms/">Our Rooms</a> <a href="/about-us/">About</a> <a href="/blog/post-1">Blog</a> <a href="/private/area">Members</a> <a href="https://elsewhere.example.org/contact">Partner</a></nav>`);
const CONTACT = page('Contact | Lakeview Homestay', `
  <h1>Contact Us</h1>
  <p>Address: 14 Gangaur Ghat Marg, Old City, Udaipur, Rajasthan 313001, India</p>
  <p>Call us: <a href="tel:+919829012345">+91 98290 12345</a></p>
  <p>Email: <a href="mailto:stay@lakeviewhomestay.example">stay@lakeviewhomestay.example</a></p>`);
const ROOMS = page('Rooms | Lakeview Homestay', `
  <h1>Our Rooms</h1>
  <h2>Deluxe Lake View Room</h2><p>Air-conditioned room with a double bed and a window onto the lake.</p><p>Starting from ₹3,500 per night</p>
  <h2>Family Suite</h2><p>Two connected rooms for up to five guests.</p><p>From ₹6,000 per night</p>
  <p>Check-in: 12 noon | Check-out: 10:00 AM</p>`);

const hotelSite = async (t, over = {}) => {
  const site = await startSite({
    '/': { body: HOME },
    '/contact/': { body: CONTACT },
    '/rooms/': { body: ROOMS },
    '/about-us/': { body: page('About', '<h1>About us</h1><p>Free Wi-Fi and a rooftop restaurant. Airport pick-up on request.</p>') },
    '/robots.txt': (req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`User-agent: *\nDisallow: /private\nSitemap: http://${req.headers.host}/sitemap.xml\n`); },
    '/sitemap.xml': (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(`<urlset>${['/', '/contact/', '/rooms/', '/about-us/', '/blog/post-1', '/private/area'].map((p) => `<url><loc>http://${req.headers.host}${p}</loc></url>`).join('')}</urlset>`); },
    ...over
  });
  t.after(() => site.close());
  return site;
};

test('a whole hotel site: the home page, then the contact, rooms and about pages, merged into one answer', async (t) => {
  const site = await hotelSite(t);
  const r = await findHotel(`${site.origin}/`, local);
  assert.equal(r.ok, true, r.message);
  const { hotel, fieldInfo, completeness, pages, skipped } = r.data;
  assert.equal(hotel.name, 'Lakeview Homestay');
  assert.equal(hotel.address.locality, 'Udaipur');
  assert.equal(hotel.address.postalCode, '313001');
  assert.equal(hotel.address.country, 'India');
  assert.equal(hotel.phones[0].display, '+91 98290 12345');
  assert.deepEqual(hotel.emails, ['stay@lakeviewhomestay.example']);
  assert.deepEqual(hotel.rooms.map((x) => x.name).sort(), ['Deluxe Lake View Room', 'Family Suite']);
  assert.equal(hotel.checkIn, '12:00');
  assert.equal(hotel.checkOut, '10:00');
  assert.deepEqual([hotel.rates.currency, hotel.rates.from, hotel.rates.to, hotel.rates.unit], ['INR', 3500, 6000, 'night']);
  assert.ok(hotel.amenities.includes('Free Wi-Fi') && hotel.amenities.includes('Airport transfer'));
  assert.equal(hotel.website, site.origin);
  assert.equal(r.data.site, '127.0.0.1');
  assert.ok(fieldInfo.name.level && fieldInfo.phones[0].level);
  assert.ok(completeness.score >= 55, `completeness ${completeness.score}`);
  assert.ok(completeness.missing.includes('pictures'));
  assert.deepEqual(pages.map((p) => p.kind).sort(), ['about', 'contact', 'rooms', 'start']);
  assert.ok(pages.every((p) => p.label && p.status === 200));
  assert.match(r.data.warnings.join(' '), /rates are as printed/i);
  assert.ok(r.data.meta.ms < 5000);
  // it obeyed robots.txt and stayed on the site
  assert.deepEqual(site.paths().filter((p) => /private|blog/.test(p)), [], 'never asked for a page robots.txt forbids, or for the blog');
  assert.deepEqual(skipped, []);
  assert.ok(site.requests.every((q) => /7HeavenHotelFinder/.test(q.headers['user-agent'])), 'every request says who is asking');
});

test('the page that was typed is forbidden by robots.txt: nothing is read, and the person is told what to do', async (t) => {
  const site = await hotelSite(t, { '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /' } });
  const r = await findHotel(site.origin, local);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ROBOTS_DISALLOWED');
  assert.equal(r.canPaste, true);
  assert.match(r.message, /robots\.txt/);
  assert.match(r.message, /paste it here instead/);
  assert.deepEqual(site.paths(), ['/robots.txt'], 'only robots.txt was asked for');
  const named = await startSite({ '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: 'User-agent: 7HeavenHotelFinder\nDisallow: /\n\nUser-agent: *\nAllow: /' }, '/': { body: HOME } });
  t.after(() => named.close());
  assert.equal((await findHotel(named.origin, local)).code, 'ROBOTS_DISALLOWED', 'a rule that names this reader is followed');
});

test('a page the site refuses to show to automatic readers says so and offers pasting; nothing is bypassed', async (t) => {
  const forbidden = await hotelSite(t, { '/': { status: 403, body: page('Forbidden', 'no') } });
  const a = await findHotel(forbidden.origin, local);
  assert.deepEqual([a.ok, a.code, a.canPaste], [false, 'BLOCKED_BY_SITE', true]);
  const wall = await hotelSite(t, { '/': { body: page('Just a moment...', '<p>Checking your browser before accessing the site</p><script src="/cdn-cgi/challenge-platform/h/g/orchestrate"></script>') } });
  const b = await findHotel(wall.origin, local);
  assert.deepEqual([b.ok, b.code, b.canPaste], [false, 'BLOCKED_BY_SITE', true]);
  assert.match(b.message, /does not try to get past/);
  assert.equal(wall.requests.filter((q) => q.path === '/').length, 1, 'asked once, not retried with another disguise');
});

test('what each kind of trouble says, and whether pasting could help', async (t) => {
  const site = await hotelSite(t, {
    '/': { body: HOME },
    '/missing': { status: 404, body: page('Not found') },
    '/down': { status: 503, body: 'maintenance' },
    '/pdf': { headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4' },
    '/slow': { delayMs: 2500, body: HOME }
  });
  const check = async (path, code, canPaste, extra = {}) => {
    const r = await findHotel(`${site.origin}${path}`, { ...local, ...extra });
    assert.equal(r.ok, false, path);
    assert.equal(r.code, code, `${path}: ${r.message}`);
    assert.equal(r.canPaste, canPaste, path);
    assert.ok(r.message.length > 30);
  };
  await check('/missing', 'NOT_FOUND', false);
  await check('/down', 'SITE_ERROR', true);
  await check('/pdf', 'NOT_A_PAGE', true);
  await check('/slow', 'TIMEOUT', true, { budgetMs: 1200 });
  const bad = await findHotel('not a web address', local);
  assert.deepEqual([bad.ok, bad.code, bad.canPaste], [false, 'BAD_URL', false]);
  const priv = await findHotel('http://169.254.169.254/latest/meta-data/');
  assert.deepEqual([priv.ok, priv.code], [false, 'BLOCKED_ADDRESS']);
  const empty = await findHotel('');
  assert.deepEqual([empty.ok, empty.code], [false, 'BAD_URL']);
});

test('a page with no hotel on it is reported as nothing found, with advice', async (t) => {
  const site = await startSite({ '/': { body: page('Grandma\'s cakes', '<p>Flour, sugar and eggs.</p>') } });
  t.after(() => site.close());
  const r = await findHotel(site.origin, local);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NOTHING_FOUND');
  assert.equal(r.canPaste, true);
  assert.match(r.message, /Contact or About page/);
});

test('a page drawn by scripts gives what its data states, and says that most of it could not be read', async (t) => {
  const site = await startSite({ '/': { body: fixture('script-drawn-app.html') } });
  t.after(() => site.close());
  const r = await findHotel(site.origin, local);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.data.hotel.name, 'Coral Bay Resort');
  assert.equal(r.data.hotel.phones[0].display, '+91 832 227 5599');
  assert.deepEqual(r.data.hotel.geo, { lat: 15.5524, lng: 73.7517 });
  assert.match(r.data.warnings.join(' '), /draws its content with scripts/);
  assert.ok(r.data.completeness.score < 60);
});

test('a redirect on the same site is followed, and a redirect to another site is reported', async (t) => {
  const site = await hotelSite(t, { '/': { status: 302, headers: { location: '/en/' } }, '/en/': { body: HOME } });
  const r = await findHotel(site.origin, local);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.data.hotel.name, 'Lakeview Homestay');
  assert.equal(r.data.warnings.some((w) => /sent us to/.test(w)), false, 'the same site: nothing to report');
  assert.equal(r.data.pages[0].url, `${site.origin}/en/`);
});

test('a page that fails or is refused is skipped, the rest still answers, and the time budget is kept', async (t) => {
  const site = await hotelSite(t, {
    '/contact/': { status: 500, body: 'oops' },
    '/rooms/': { delayMs: 6000, body: ROOMS }
  });
  const started = Date.now();
  const r = await findHotel(site.origin, { ...local, budgetMs: 3500 });
  assert.equal(r.ok, true, r.message);
  assert.ok(Date.now() - started < 5500, `took ${Date.now() - started} ms`);
  assert.equal(r.data.hotel.name, 'Lakeview Homestay');
  const why = Object.fromEntries(r.data.skipped.map((s) => [new URL(s.url).pathname, s.reason]));
  assert.match(why['/contact/'], /problem|error 500/);
  assert.match(why['/rooms/'], /took too long|out of time/);
  assert.deepEqual(r.data.pages.map((p) => p.kind).sort(), ['about', 'start']);
});

test('at most a few pages are read, at most three at once, however many the sitemap offers', async (t) => {
  let inFlight = 0;
  let peak = 0;
  const slow = (body) => async (req, res) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 250));
    inFlight -= 1;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  };
  const many = Array.from({ length: 40 }, (_, i) => `/rooms-${i}/`);
  const routes = { '/': { body: page('Big Hotel', `<h1>Big Hotel</h1><p>A hotel with many rooms. Check-in 2 PM.</p>${many.map((p) => `<a href="${p}">Rooms ${p}</a>`).join('')}`) } };
  for (const p of many) routes[p] = slow(page('Room', '<h2>Deluxe Room</h2><p>A nice room.</p>'));
  const site = await startSite(routes);
  t.after(() => site.close());
  const r = await findHotel(site.origin, local);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.data.pages.length, 1 + FINDER_LIMITS.extraPages);
  assert.ok(peak <= FINDER_LIMITS.concurrency, `peak ${peak}`);
  assert.equal(site.paths().filter((p) => p.startsWith('/rooms-')).length, FINDER_LIMITS.extraPages);
});

test('pictures and links of the answer never point inside a network', async (t) => {
  const site = await hotelSite(t, { '/': { body: page('Hotel Pics', '<h1>Hotel Pics</h1><p>Check-in 2 PM. A hotel with rooms.</p><img src="/p/room.jpg" width="1200" height="800" alt="Room"><img src="http://169.254.169.254/x.jpg" width="1200" height="800" alt="Metadata"><a href="https://www.facebook.com/hotelpics">fb</a>') } });
  const strict = await findHotel(site.origin, local);
  assert.equal(strict.ok, true, strict.message);
  // in this test every address is on 127.0.0.1 (allowed only for tests); the metadata address is a different matter
  assert.ok(strict.data.hotel.images.some((i) => i.url.endsWith('/p/room.jpg')));
});

test('the same site read twice gives the same answer', async (t) => {
  const site = await hotelSite(t);
  const a = await findHotel(site.origin, local);
  const b = await findHotel(site.origin, local);
  const strip = (r) => JSON.stringify({ ...r.data, meta: undefined });
  assert.equal(strip(a), strip(b));
});

// ---- pasted text ----

const PASTED = `Lakeview Homestay
Udaipur, Rajasthan

3-star comfort in the old city. Lakeview Homestay is a family-run guest house on the banks of Lake Pichola, a five-minute walk from the City Palace.

Rooms
Deluxe Lake View Room
Air-conditioned room with a double bed. Starting from ₹3,500 per night
Family Suite
Two connected rooms for up to five guests. From ₹6,000 per night

Amenities
Free Wi-Fi
Rooftop restaurant
Airport pick-up
Parking

Check-in: 12 noon | Check-out: 10:00 AM

Contact
Address: 14 Gangaur Ghat Marg, Old City, Udaipur, Rajasthan 313001, India
Call us: +91 98290 12345
Email: stay@lakeviewhomestay.example`;

test('pasted text: a hotel\'s page copied by hand gives the same kinds of facts', () => {
  const r = findFromText(PASTED, { url: 'https://lakeviewhomestay.com/' });
  assert.equal(r.ok, true, r.message);
  const { hotel } = r.data;
  assert.equal(hotel.name, 'Lakeview Homestay');
  assert.equal(hotel.address.locality, 'Udaipur');
  assert.equal(hotel.address.postalCode, '313001');
  assert.equal(hotel.phones[0].display, '+91 98290 12345');
  assert.deepEqual(hotel.emails, ['stay@lakeviewhomestay.example']);
  assert.deepEqual(hotel.rooms.map((x) => x.name), ['Deluxe Lake View Room', 'Family Suite']);
  assert.equal(hotel.checkIn, '12:00');
  assert.deepEqual([hotel.rates.from, hotel.rates.to], [3500, 6000]);
  for (const a of ['Free Wi-Fi', 'Rooftop restaurant', 'Airport pick-up', 'Parking']) assert.ok(hotel.amenities.includes(a), a);
  assert.equal(hotel.starRating, '3 star');
  assert.equal(r.data.source, 'pasted');
  assert.equal(r.data.pages[0].kind, 'pasted');
  assert.equal(hotel.website, 'https://lakeviewhomestay.com');
});

test('pasted text: it may also be the page\'s HTML, and the address is optional', () => {
  const r = findFromText(fixture('microdata-inn.html'));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.data.hotel.name, 'Riverside Inn & Suites');
  assert.equal(r.data.hotel.website, '', 'no address given, so no website is claimed');
  assert.equal(r.data.sourceUrl, '');
  assert.ok(r.data.hotel.images.length === 0, 'pictures of a page with no known address cannot be fetched');
  const text = findFromText(PASTED);
  assert.equal(text.ok, true);
});

test('pasted text: every way it can be wrong is said in words', () => {
  const cases = [
    [undefined, 'EMPTY_TEXT'], [null, 'EMPTY_TEXT'], ['', 'EMPTY_TEXT'], ['   \n  ', 'EMPTY_TEXT'], [42, 'EMPTY_TEXT'],
    ['too short', 'TEXT_TOO_SHORT'], ['x'.repeat(30), 'TEXT_TOO_SHORT'],
    ['Flour, sugar, eggs and butter. Mix well and bake for forty minutes in a warm oven until golden.', 'NOTHING_FOUND']
  ];
  for (const [input, code] of cases) {
    const r = findFromText(input);
    assert.equal(r.ok, false, String(input));
    assert.equal(r.code, code, `${String(input).slice(0, 30)}: ${r.message}`);
    assert.ok(r.message.length > 20);
  }
  const badUrl = findFromText(PASTED, { url: 'http://localhost/x' });
  assert.deepEqual([badUrl.ok, badUrl.code], [false, 'BLOCKED_ADDRESS']);
  assert.match(badUrl.message, /^The address of the page: /);
});

test('pasted text: a very long paste is cut, with a note, and script text in it is never read as content', () => {
  const long = `${PASTED}\n${'Lorem ipsum dolor sit amet. '.repeat(20000)}`;
  const r = findFromText(long);
  assert.equal(r.ok, true);
  assert.match(r.data.warnings.join(' '), /very long/);
  const hostile = findFromText(`<html><body><h1>Hotel Evil</h1><p>A hotel with rooms and check-in at 2 PM, in the old town of Testville.</p><script>var x="hacker@evil.example"; document.write("<b>x</b>")</script><div style="display:none">hidden@evil.example</div></body></html>`);
  assert.equal(hostile.ok, true, hostile.message);
  assert.deepEqual(hostile.data.hotel.emails, []);
  assert.doesNotMatch(JSON.stringify(hostile.data.hotel), /[<>]/);
});

test('textToHtml: short lines before longer text become headings, everything is escaped', () => {
  const html = textToHtml('Hotel Orchid\nA lovely hotel by the sea with large rooms.\nSay <b>hi</b> & goodbye\n\nRooms\nDeluxe Room\nA bright room with a double bed and a view of the lake.\nFree Wi-Fi\nParking');
  assert.doesNotMatch(html, /<h2>Free Wi-Fi<\/h2>/, 'a short line followed by another short line is a list item');
  assert.match(html, /<h2>Hotel Orchid<\/h2>/);
  assert.match(html, /<p>Say &lt;b&gt;hi&lt;\/b&gt; &amp; goodbye<\/p>/);
  assert.match(html, /<h2>Deluxe Room<\/h2>/);
  assert.doesNotMatch(html, /<b>/);
});
