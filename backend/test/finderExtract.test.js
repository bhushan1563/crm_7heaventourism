import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fc from 'fast-check';
import { extractPage } from '../src/services/hotelFinder/extract/index.js';
import { parseHtml, plainText, resolveUrl, visibleLines } from '../src/services/hotelFinder/extract/dom.js';
import { findAmounts, nameFromTitle, normalizeEmail, normalizePhone, normalizeTime, parsePriceRange, starsFromText } from '../src/services/hotelFinder/extract/normalize.js';
import { addressParts } from '../src/services/hotelFinder/extract/contact.js';
import { bestFromSrcset } from '../src/services/hotelFinder/extract/images.js';
import { rankPages } from '../src/services/hotelFinder/extract/links.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/hotels/${name}`, import.meta.url), 'utf8');
const read = (name, url) => extractPage({ url, html: fixture(name) });
const values = (r, field) => r.candidates.filter((c) => c.field === field).sort((a, b) => b.confidence - a.confidence);
const best = (r, field) => values(r, field)[0]?.value;
const bestOf = (r, field, source) => values(r, field).find((c) => c.source === source)?.value;
const all = (r, field) => [...new Set(values(r, field).map((c) => (typeof c.value === 'object' ? JSON.stringify(c.value) : c.value)))];

// ---- the small rules ----

test('normalizeTime: every way of writing a time', () => {
  const table = [
    ['14:00', '14:00'], ['2 PM', '14:00'], ['2pm', '14:00'], ['2:30 pm', '14:30'], ['2:30 P.M.', '14:30'], ['11 AM', '11:00'], ['11:00 a.m.', '11:00'], ['12 noon', '12:00'], ['noon', '12:00'], ['midnight', '00:00'],
    ['12 AM', '00:00'], ['12:30 am', '00:30'], ['12 PM', '12:00'], ['14h00', '14:00'], ['14.00', '14:00'], ['T14:00:00+05:30', '14:00'], ['14:00:00', '14:00'], ['From 2 PM', '14:00'], ['after 14:00 hrs', '14:00'], ['00:00', '00:00'], ['23:59', '23:59'], ['9:05', '09:05']
  ];
  for (const [input, expected] of table) assert.equal(normalizeTime(input), expected, input);
  for (const bad of ['', 'banana', '25:00', '13 PM', '0 PM', '14:75', '2', 'check in', null, undefined, '12:60', '99', 'noon-ish 3 noon']) assert.equal(normalizeTime(bad), null, String(bad));
});

test('normalizePhone: real numbers in many styles, and things that only look like numbers', () => {
  const good = ['+91 98290 12345', '+91-98290-12345', '098290 12345', '(0294) 242-8800', '+1 (555) 010-9999', '+44 20 7946 0958', '0135 243 1234', '+971 4 123 4567', '9829012345', '+9198290 12345'];
  for (const raw of good) assert.ok(normalizePhone(raw), raw);
  assert.equal(normalizePhone('+91 98290 12345').key, '9829012345');
  assert.equal(normalizePhone('098290-12345').key, normalizePhone('+91 98290 12345').key);
  const bad = ['', '12', '1234567', '2019-2024', '12-12-2024', '12/10/2026', '2026-05-01', '24.5714, 73.6804', '24.5714', '1111111111', '0000000000', '123456789012345678', '1234567890', 'call me', '(123', '123)', '₹ 4,200', '4.5', null, undefined, '12345678901234567890'];
  for (const raw of bad) assert.equal(normalizePhone(raw), null, String(raw));
});

test('normalizeEmail: tidy real addresses, refuse placeholders and file names', () => {
  assert.equal(normalizeEmail('Reservations@GrandLakePalace.Example'), 'reservations@grandlakepalace.example');
  assert.equal(normalizeEmail('mailto:stay@hotel.in?subject=Booking'), 'stay@hotel.in');
  assert.equal(normalizeEmail('<info@hotel.com>.'), 'info@hotel.com');
  assert.equal(normalizeEmail('first.last+booking@sub.hotel.co.in'), 'first.last+booking@sub.hotel.co.in');
  for (const bad of ['', 'plain', '@hotel.com', 'a@b', 'a@b.c', 'a b@hotel.com', 'a@@hotel.com', 'info@example.com', 'your@email.com', 'name@domain.com', 'test@test.com', 'sprite@2x.png', 'logo@hotel.png', 'noreply@hotel.com', 'user@localhost', `${'a'.repeat(70)}@hotel.com`, 'a@hotel..com', null, undefined, 42]) assert.equal(normalizeEmail(bad), null, String(bad));
});

test('starsFromText: stars in words, digits and symbols, and nothing for marketing', () => {
  const table = [['5-star hotel', 5], ['a 4 star resort', 4], ['Four Star Hotel', 4], ['three-star', 3], ['★★★★★', 5], ['★★★', 3], ['5* hotel', 5], ['2 stars', 2], ['5 STAR', 5]];
  for (const [input, expected] of table) assert.equal(starsFromText(input), expected, input);
  for (const input of ['7-star luxury', 'six star', '★★', '★', 'star wars', 'we have 15 stars', '10 star hotel', '', null]) assert.equal(starsFromText(input), null, String(input));
});

test('findAmounts: an amount needs a currency next to it', () => {
  const a = findAmounts('Rooms from ₹3,500 per night, suites Rs. 12,000/-, or 150 USD, or INR 1,00,000 and $120.50. Year 2024, room 305, 4,500 guests.');
  const got = Object.fromEntries(a.map((x) => [`${x.currency}${x.amount}`, true]));
  for (const key of ['INR3500', 'INR12000', 'INR100000', 'USD120.5', 'USD150']) assert.ok(got[key], key);
  assert.equal(a.some((x) => [2024, 305, 4500].includes(x.amount)), false, 'a year, a room number and a guest count are not prices');
  assert.deepEqual(findAmounts('From ₹2.5k per night').map((x) => x.amount), [2500]);
  assert.deepEqual(findAmounts('₹1.5 lakh per week').map((x) => x.amount), [150000]);
  assert.deepEqual(findAmounts('no money here, only 12 rooms'), []);
  assert.deepEqual(findAmounts(''), []);
  assert.deepEqual(findAmounts('Rs 0'), []);
  assert.deepEqual(findAmounts('trs 500'), [], 'a currency sign inside a word is not a currency');
});

test('parsePriceRange: levels, ranges and bare numbers', () => {
  assert.deepEqual(parsePriceRange('₹₹₹₹'), { currency: 'INR', from: 0, to: 0, level: 4 });
  assert.deepEqual(parsePriceRange('$$'), { currency: 'USD', from: 0, to: 0, level: 2 });
  assert.deepEqual(parsePriceRange('₹5,000 - ₹9,000'), { currency: 'INR', from: 5000, to: 9000, level: 0 });
  assert.deepEqual(parsePriceRange('5000-9000'), { currency: '', from: 5000, to: 9000, level: 0 });
  assert.equal(parsePriceRange(''), null);
  assert.equal(parsePriceRange('cheap'), null);
});

test('nameFromTitle: the hotel\'s own name out of a page title', () => {
  const table = [
    ['Taj Lake Palace, Udaipur | Official Site', 'Taj Lake Palace'],
    ['Lakeview Homestay - Udaipur | Official Site', 'Lakeview Homestay'],
    ['Welcome to Hotel Orchid', 'Hotel Orchid'],
    ['Home | Hotel Orchid', 'Hotel Orchid'],
    ['Hotel Orchid :: Best hotels in Mumbai', 'Hotel Orchid'],
    ['Luxury Hotels in Goa | Coral Bay Resort', 'Coral Bay Resort'],
    ['The Leela Palace', 'The Leela Palace'],
    ['  ', ''],
    ['', '']
  ];
  for (const [input, expected] of table) assert.equal(nameFromTitle(input), expected, input);
});

test('addressParts: a street, a city, a state, a postal code and a country', () => {
  assert.deepEqual(addressParts('14 Gangaur Ghat Marg, Old City, Udaipur, Rajasthan 313001, India'), { street: '14 Gangaur Ghat Marg, Old City', locality: 'Udaipur', region: 'Rajasthan', postalCode: '313001', country: 'India' });
  assert.deepEqual(addressParts('Pichola, Udaipur, India'), { street: 'Pichola', locality: 'Udaipur', region: '', postalCode: '', country: 'India' });
  assert.equal(addressParts('221B Baker Street, London NW1 6XE, United Kingdom').postalCode, 'NW1 6XE');
  assert.equal(addressParts('One Market St, San Francisco, CA 94105, USA').postalCode, '94105');
  assert.equal(addressParts('somewhere').locality, '');
  assert.equal(addressParts('').street, '');
});

test('dom helpers: visible text skips what a visitor cannot see, entities are decoded, addresses resolved', () => {
  const doc = parseHtml('<p>Hello &amp; welcome</p><script>secret()</script><style>.x{}</style><div hidden>no</div><div style="display: none">no</div><div aria-hidden="true">no</div><noscript>no</noscript><h2>Rooms</h2><p>Deluxe<br>room</p>');
  assert.deepEqual(visibleLines(doc).map((l) => l.text), ['Hello & welcome', 'Rooms', 'Deluxe', 'room']);
  assert.equal(visibleLines(doc).find((l) => l.text === 'Rooms').heading, true);
  assert.equal(plainText('Fish &amp; chips <b>fresh</b><script>alert(1)</script>'), 'Fish & chips fresh');
  assert.equal(resolveUrl('/a/b?x=1#frag', 'https://hotel.com/p/q'), 'https://hotel.com/a/b?x=1');
  assert.equal(resolveUrl('../c', 'https://hotel.com/p/q/'), 'https://hotel.com/p/c');
  for (const bad of ['javascript:alert(1)', 'mailto:a@b.com', 'tel:+911234567890', 'data:text/html,x', '#top', '', 'file:///etc/passwd', 'telephone-directory'.slice(0, 0)]) assert.equal(resolveUrl(bad, 'https://hotel.com/'), null, bad);
  assert.equal(resolveUrl('telephone-directory', 'https://hotel.com/x/'), 'https://hotel.com/x/telephone-directory');
});

test('bestFromSrcset picks the largest picture', () => {
  assert.equal(bestFromSrcset('a.jpg 300w, b.jpg 1200w, c.jpg 600w').url, 'b.jpg');
  assert.equal(bestFromSrcset('a.jpg 1x, b.jpg 2x').url, 'b.jpg');
  assert.equal(bestFromSrcset('only.jpg').url, 'only.jpg');
  assert.equal(bestFromSrcset(''), null);
});

// ---- a hotel that says everything in structured data ----

test('structured data: a palace hotel with JSON-LD gives everything it says, at high confidence', () => {
  const r = read('grand-palace.html', 'https://www.grandlakepalace.example/');
  assert.deepEqual(r.failed, []);
  assert.equal(best(r, 'name'), 'The Grand Lake Palace');
  assert.equal(values(r, 'name')[0].source, 'json-ld');
  assert.match(best(r, 'description'), /^A heritage palace hotel on the shore of Lake Pichola & the City Palace, with 83 rooms & suites, a spa and fine dining\.$/, 'entities decoded and tags removed');
  assert.equal(best(r, 'starRating'), 5);
  assert.deepEqual(best(r, 'rating'), { value: 4.7, best: 5, count: 1204 });
  assert.equal(best(r, 'address.street'), 'Lake Pichola, Pichola');
  assert.equal(best(r, 'address.locality'), 'Udaipur');
  assert.equal(best(r, 'address.region'), 'Rajasthan');
  assert.equal(best(r, 'address.postalCode'), '313001');
  assert.equal(best(r, 'address.country'), 'IN');
  assert.deepEqual(best(r, 'geo'), { lat: 24.5754, lng: 73.6803 });
  assert.equal(best(r, 'phone').key, '2942428800');
  assert.equal(best(r, 'email'), 'reservations@grandlakepalace.example');
  assert.equal(best(r, 'checkIn'), '14:00');
  assert.equal(best(r, 'checkOut'), '11:00');
  assert.equal(best(r, 'roomCount'), 83);
  assert.equal(best(r, 'propertyType'), 'Hotel');
  assert.deepEqual(all(r, 'amenity').filter((a) => ['Free WiFi', 'Outdoor swimming pool', 'Spa', 'Casino'].includes(a)).sort(), ['Free WiFi', 'Outdoor swimming pool', 'Spa']);
  assert.ok(!all(r, 'amenity').includes('Casino'), 'a feature marked false is not an amenity');
  assert.equal(best(r, 'petsPolicy'), 'Pets are not allowed');
  const rooms = values(r, 'room').map((c) => c.value);
  assert.deepEqual(rooms.map((x) => x.name).sort(), ['Lake View Suite', 'Palace Room']);
  assert.match(rooms.find((x) => x.name === 'Lake View Suite').details, /Spacious suite overlooking Lake Pichola.*King bed.*Sleeps 3/);
  assert.deepEqual(values(r, 'social').map((c) => c.value.url).sort(), ['https://www.facebook.com/grandlakepalace', 'https://www.instagram.com/grandlakepalace/', 'https://www.tripadvisor.com/Hotel_Review-g297672-d301742-Reviews-The_Grand_Lake_Palace-Udaipur.html'].sort());
  const price = values(r, 'price').find((c) => c.value.kind === 'offer').value;
  assert.deepEqual([price.currency, price.from], ['INR', 28500]);
  assert.equal(best(r, 'priceLevel'), 4);
  const images = values(r, 'image').map((c) => c.value.url);
  assert.ok(images.includes('https://www.grandlakepalace.example/media/hero-palace.jpg'));
  assert.ok(images.includes('https://www.grandlakepalace.example/media/lake-view-suite.jpg'));
  // the same facts also appear in the footer: the footer agrees with the structured data
  assert.ok(values(r, 'phone').some((c) => c.source === 'tel-link'));
  assert.ok(values(r, 'email').some((c) => c.source === 'mailto-link'));
  assert.ok(values(r, 'address.full').some((c) => c.source === 'address-tag'));
});

test('structured data: the page gives its links for the crawl, with the same-site ones only', () => {
  const r = read('grand-palace.html', 'https://www.grandlakepalace.example/');
  assert.deepEqual(r.links.map((l) => new URL(l.url).pathname), ['/', '/rooms', '/dining', '/contact-us']);
  assert.equal(r.page.title, 'The Grand Lake Palace, Udaipur | Official Website');
  assert.equal(r.page.lang, 'en');
  assert.equal(r.page.scriptDrawn, false);
});

test('microdata: a hotel described with itemprops is read the same way', () => {
  const r = read('microdata-inn.html', 'https://riversideinn.example/');
  assert.equal(best(r, 'name'), 'Riverside Inn & Suites');
  assert.equal(best(r, 'starRating'), 3);
  assert.equal(best(r, 'address.locality'), 'Rishikesh');
  assert.equal(best(r, 'address.postalCode'), '249201');
  assert.equal(best(r, 'phone').key, '1352431234');
  assert.equal(best(r, 'email'), 'book@riversideinn.example');
  assert.deepEqual(best(r, 'geo'), { lat: 30.0869, lng: 78.2676 });
  assert.equal(best(r, 'checkIn'), '14:00');
  assert.equal(best(r, 'checkOut'), '11:00');
  assert.deepEqual(best(r, 'rating'), { value: 8.6, best: 10, count: 312 });
  assert.ok(values(r, 'image').some((c) => c.value.url === 'https://riversideinn.example/photos/riverside-front.jpg'));
  assert.equal(values(r, 'name')[0].source, 'microdata');
});

// ---- a small hotel with only words ----

test('plain page: a homestay with no structured data still gives its contact, rooms, times, amenities and rates', () => {
  const r = read('lakeview-homestay.html', 'https://lakeviewhomestay.example/');
  assert.deepEqual(r.failed, []);
  assert.equal(best(r, 'name'), 'Lakeview Homestay');
  assert.match(best(r, 'description'), /^A family-run homestay with lake views in the old city of Udaipur/);
  assert.equal(best(r, 'starRating'), 3);

  const phones = all(r, 'phone').map((p) => JSON.parse(p).key);
  assert.deepEqual([...new Set(phones)], ['9829012345'], 'the same number from the link, the WhatsApp link and the text; the fax and the hidden or script numbers are not taken');
  assert.ok(!phones.includes('2942554321'), 'a fax number is not the hotel phone');
  const emails = all(r, 'email').sort();
  assert.deepEqual(emails, ['hello@lakeviewhomestay.example', 'stay@lakeviewhomestay.example'], 'no placeholder, hidden, script, comment or noscript e-mails');

  assert.equal(best(r, 'address.full'), '14 Gangaur Ghat Marg, Old City, Udaipur, Rajasthan 313001, India');
  assert.equal(best(r, 'address.locality'), 'Udaipur');
  assert.equal(best(r, 'address.postalCode'), '313001');
  assert.equal(best(r, 'address.country'), 'India');
  assert.deepEqual(best(r, 'geo'), { lat: 24.5764, lng: 73.6805 });

  assert.equal(best(r, 'checkIn'), '12:00');
  assert.equal(best(r, 'checkOut'), '10:00');
  const rooms = values(r, 'room').map((c) => c.value);
  assert.deepEqual(rooms.map((x) => x.name), ['Deluxe Lake View Room', 'Family Suite', 'Rooftop Dormitory']);
  assert.match(rooms[0].details, /Air-conditioned room with a double bed/);
  const amenities = all(r, 'amenity');
  for (const want of ['Free Wi-Fi', 'Rooftop restaurant', 'Airport pick-up', 'Laundry service', 'Parking']) assert.ok(amenities.includes(want), want);
  assert.ok(!amenities.includes('Book Now'), 'menu words are not amenities');
  assert.ok(amenities.includes('Breakfast'), 'a known amenity named in the text');

  const prices = values(r, 'price').map((c) => c.value);
  assert.ok(prices.some((p) => p.from === 3500 && p.currency === 'INR' && p.unit === 'night'));
  assert.ok(prices.some((p) => p.from === 6000 && p.unit === 'night'));
  assert.ok(prices.some((p) => p.from === 800 && p.unit === 'person'), 'a per-person bed rate is marked as per person');
  assert.ok(!prices.some((p) => p.from === 500), '"₹500 off" is a discount, not a rate');

  assert.match(best(r, 'policy.cancellation'), /Free cancellation up to 7 days/);
  assert.match(best(r, 'policy.children'), /Children below 5 years stay free/);

  const social = Object.fromEntries(values(r, 'social').map((c) => [c.value.network, c.value.url]));
  assert.deepEqual(social, { facebook: 'https://www.facebook.com/lakeviewhomestay', instagram: 'https://www.instagram.com/lakeviewhomestay', youtube: 'https://www.youtube.com/@lakeviewhomestay', booking: 'https://www.booking.com/hotel/in/lakeview-homestay.html' });
});

test('plain page: pictures are the photos, at their largest size, not logos, icons, badges or pixels', () => {
  const r = read('lakeview-homestay.html', 'https://lakeviewhomestay.example/');
  const urls = values(r, 'image').map((c) => c.value.url);
  assert.ok(urls.includes('https://lakeviewhomestay.example/uploads/hero-lake.jpg'), 'a background picture');
  assert.ok(urls.includes('https://lakeviewhomestay.example/uploads/room-1.jpg'), 'a lazy-loaded picture (the data: placeholder is ignored)');
  assert.ok(urls.includes('https://lakeviewhomestay.example/uploads/room-2-1200x800.jpg'), 'the largest of a srcset');
  assert.ok(!urls.includes('https://lakeviewhomestay.example/uploads/room-2-300x200.jpg'), 'and not the small one');
  assert.ok(urls.includes('https://lakeviewhomestay.example/uploads/view.webp'));
  assert.ok(urls.includes('https://lakeviewhomestay.example/uploads/terrace-1600.webp'), 'the largest source of a picture element');
  for (const never of ['logo.png', 'wifi-icon.png', 'payment-visa.png', 'animation.gif', 'pixel.png']) assert.ok(!urls.some((u) => u.endsWith(never)), never);
  assert.equal(new Set(urls).size, urls.length, 'no picture twice');
  assert.equal(values(r, 'image').find((c) => c.value.url.endsWith('room-1.jpg')).value.role, 'room', 'its caption says room');
  assert.equal(values(r, 'image').find((c) => c.value.url.endsWith('view.webp')).value.role, 'gallery', 'it sits in the gallery');
});

test('plain page: the contact page links come first when ranking which pages to read', () => {
  const r = read('lakeview-homestay.html', 'https://lakeviewhomestay.example/');
  const chosen = rankPages({ start: 'https://lakeviewhomestay.example/', links: r.links, limit: 6 });
  assert.deepEqual(chosen.map((c) => [new URL(c.url).pathname, c.kind]), [['/contact/', 'contact'], ['/rooms/', 'rooms'], ['/about-us/', 'about'], ['/facilities/', 'facilities'], ['/gallery/', 'gallery']]);
  assert.ok(!chosen.some((c) => /blog|booking\.com/.test(c.url)), 'the blog and a booking site are never read');
});

// ---- a page drawn by scripts, and a hostile one ----

test('a page drawn by scripts: says so, and still gives what its embedded data states', () => {
  const r = read('script-drawn-app.html', 'https://coralbay.example/');
  assert.equal(r.page.scriptDrawn, true);
  assert.equal(best(r, 'name'), 'Coral Bay Resort');
  assert.equal(best(r, 'phone').key, '8322275599');
  assert.equal(values(r, 'phone')[0].confidence <= 0.4, true, 'embedded data is trusted less than a link or a hotel entity');
  assert.equal(best(r, 'email'), 'stay@coralbay.example');
  assert.deepEqual(best(r, 'geo'), { lat: 15.5524, lng: 73.7517 });
});

test('a hostile page: nothing is run, bad values are dropped, good ones kept', () => {
  const r = read('hostile.html', 'https://evilinn.example/');
  assert.equal(best(r, 'name'), 'Evil Inn', 'the tag in the name is not kept');
  for (const c of r.candidates) assert.doesNotMatch(JSON.stringify(c.value), /[<>]|alert\(/, `${c.field} must carry no markup or script text: ${JSON.stringify(c.value)}`);
  assert.equal(best(r, 'description'), 'Nice place & clean rooms.');
  assert.equal(values(r, 'geo').length, 0, 'impossible coordinates are dropped');
  assert.equal(values(r, 'starRating').length, 0, 'a nine-star rating is not taken');
  assert.equal(values(r, 'rating').length, 0, 'a rating above its own scale is not taken');
  assert.equal(best(r, 'checkIn'), undefined);
  assert.deepEqual(all(r, 'email'), ['valid.person@evilinn.example'], 'placeholders, malformed and example addresses are dropped');
  const phones = all(r, 'phone').map((p) => JSON.parse(p).key);
  assert.deepEqual(phones, ['5550109999'], 'dates, ids, years, coordinates and repeated digits are not phone numbers');
  assert.deepEqual(values(r, 'social').map((c) => c.value.url), ['https://www.facebook.com/evilinn'], 'a javascript: link and a bare facebook.com are not social pages');
  assert.deepEqual(values(r, 'price').map((c) => c.value.from), [4200], '"Rs 50 off" is not a rate; a rate with "per night" is');
  assert.equal(values(r, 'image').some((c) => c.value.url.startsWith('javascript:')), false);
});

test('a title that never closes swallows the page, as it does in a browser, and nothing breaks', () => {
  const r = extractPage({ url: 'https://x.example/', html: '<html><head><title>Hotel X <b>bold</b> & more<script>alert(1)</script><p>tel +91 98290 12345' });
  assert.deepEqual(r.failed, []);
  assert.ok(r.page.title.length <= 200);
  assert.ok(r.candidates.every((c) => !/[<>]/.test(JSON.stringify(c.value))));
});

// ---- never fails ----

test('property: extractPage never throws and every candidate is well formed', () => {
  const FIELDS = new Set(['name', 'description', 'tagline', 'propertyType', 'starRating', 'rating', 'address.full', 'address.street', 'address.locality', 'address.region', 'address.postalCode', 'address.country', 'geo', 'phone', 'email', 'website', 'social', 'checkIn', 'checkOut', 'amenity', 'room', 'price', 'priceLevel', 'image', 'logo', 'roomCount', 'petsPolicy', 'policy.cancellation', 'policy.children', 'policy.pets']);
  const pieces = fc.constantFrom('<a href="tel:+91 98290 12345">', '<a href="mailto:a@hotel.in">', '</a>', '<h1>Hotel X</h1>', '<h2>Rooms</h2>', '<h3>Deluxe Room</h3>', '<p>Check-in: 2 PM</p>', '<p>From ₹3,500 per night</p>', '<img src="/a.jpg" width="900" height="600">', '<script type="application/ld+json">{"@type":"Hotel","name":"X"}</script>', '<script type="application/ld+json">{', '<address>1 Road, City 123456, India</address>', '<ul><li>Free Wi-Fi</li></ul>', '<div style="display:none">', '</div>', '<<>>', '&amp;&#0;&#xD800;', '\u0000', '<iframe src="https://www.google.com/maps?q=24.5,73.6">', '<meta property="og:title" content="Hotel Y | Home">', '<base href="//x">', '5-star ★★★★★');
  fc.assert(
    fc.property(fc.oneof(fc.string({ maxLength: 600 }), fc.array(pieces, { maxLength: 40 }).map((p) => p.join(''))), (html) => {
      const r = extractPage({ url: 'https://hotel.example/page', html });
      assert.ok(r.page && Array.isArray(r.candidates) && Array.isArray(r.links) && Array.isArray(r.failed));
      assert.deepEqual(r.failed, [], `an extractor failed on ${JSON.stringify(html).slice(0, 200)}`);
      for (const c of r.candidates) {
        assert.ok(FIELDS.has(c.field), c.field);
        assert.ok(c.confidence >= 0 && c.confidence <= 1, `${c.field} ${c.confidence}`);
        assert.equal(typeof c.source, 'string');
        if (c.field === 'phone') assert.ok(normalizePhone(c.value.display), c.value.display);
        if (c.field === 'email') assert.ok(normalizeEmail(c.value), c.value);
        if (c.field === 'image') assert.match(c.value.url, /^https?:\/\//);
        if (c.field === 'geo') assert.ok(Math.abs(c.value.lat) <= 90 && Math.abs(c.value.lng) <= 180);
        if (c.field === 'starRating') assert.ok(c.value >= 1 && c.value <= 5);
        if (c.field === 'checkIn' || c.field === 'checkOut') assert.match(c.value, /^\d{2}:\d{2}$/);
        if (c.field === 'social') assert.match(c.value.url, /^https?:\/\//);
      }
    }),
    { numRuns: 500 }
  );
});

test('a very large page is read in reasonable time', () => {
  const rows = Array.from({ length: 4000 }, (_, i) => `<li><a href="/p${i}">Page ${i}</a> <span>Call +91 98290 ${String(10000 + i)}</span></li>`).join('');
  const started = Date.now();
  const r = extractPage({ url: 'https://big.example/', html: `<html><body><h1>Big Hotel</h1><ul>${rows}</ul></body></html>` });
  assert.ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`);
  assert.ok(r.candidates.length > 0);
  assert.ok(values(r, 'phone').length <= 12, 'phone numbers taken from the words are capped');
  assert.ok(r.links.length <= 400);
});

test('another country and style: a Manhattan boutique hotel in dollars, with address lines, a toll-free number and an obfuscated e-mail', () => {
  const r = read('boutique-nyc.html', 'https://hudsonrow.example/');
  assert.deepEqual(r.failed, []);
  assert.equal(best(r, 'name'), 'The Hudson Row Hotel');
  assert.equal(best(r, 'starRating'), 4);
  assert.deepEqual(all(r, 'phone').map((p) => JSON.parse(p).key).sort(), ['2125550147', '8005550199']);
  assert.deepEqual(all(r, 'email'), ['info@hudsonrow.example'], 'an address written "[at]" and "[dot]" is hidden on purpose from automatic readers, and is left alone');
  assert.equal(bestOf(r, 'address.full', 'text'), 'The Hudson Row Hotel, 520 W 34th St, New York, NY 10001, United States');
  assert.equal(bestOf(r, 'address.postalCode', 'text'), '10001');
  assert.equal(bestOf(r, 'address.country', 'text'), 'United States');
  assert.deepEqual(best(r, 'geo'), { lat: 40.7536, lng: -74.0006 });
  assert.equal(best(r, 'checkIn'), '15:00');
  assert.equal(best(r, 'checkOut'), '11:00');
  assert.deepEqual(values(r, 'room').map((c) => c.value.name), ['Queen Room', 'King Suite with Skyline View', 'Accessible King Room']);
  assert.deepEqual(values(r, 'price').map((c) => [c.value.currency, c.value.from, c.value.unit]), [['USD', 189, 'night'], ['USD', 329, 'night']]);
  const amenities = all(r, 'amenity');
  for (const want of ['Fitness centre', 'Bar', 'Concierge', 'Business centre', 'Pet friendly', 'Breakfast', 'Laundry']) assert.ok(amenities.includes(want), want);
  assert.match(best(r, 'policy.cancellation'), /free until 48 hours/);
  assert.match(best(r, 'policy.pets'), /Pets are welcome/);
  assert.equal(values(r, 'name').filter((c) => c.source === 'h1').length, 1, 'the main heading agrees with the title');
});
