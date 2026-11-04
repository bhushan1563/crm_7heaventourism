import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { STAR_RATINGS, cleanName, completeness, countryName, hotelLikeness, isPortal, levelOf, mergeCandidates, starLabel } from '../src/services/hotelFinder/merge.js';

// Choosing between the facts the extractors found: agreeing sources raise confidence, junk is dropped, the answer is tidy.

let n = 0;
const c = (field, value, source = 'text', confidence = 0.5, page = 'https://hotel.example/') => ({ field, value, source, confidence, page });
const kinds = new Map([['https://hotel.example/', 'start'], ['https://hotel.example/contact', 'contact']]);
const merge = (candidates, extra = {}) => mergeCandidates({ candidates, site: 'hotel.example', startUrl: 'https://hotel.example/', pageKinds: kinds, ...extra });
const phone = (digits) => ({ display: digits, digits, key: digits.slice(-10) });

test('levelOf: how sure, in three words', () => {
  assert.equal(levelOf(0.95), 'high');
  assert.equal(levelOf(0.8), 'high');
  assert.equal(levelOf(0.7), 'medium');
  assert.equal(levelOf(0.55), 'medium');
  assert.equal(levelOf(0.54), 'low');
  assert.equal(levelOf(0), 'low');
});

test('cleanName: a hotel name that can be trusted', () => {
  assert.equal(cleanName('  The Grand   Lake Palace '), 'The Grand Lake Palace');
  assert.equal(cleanName('Hotel Orchid | Official Site'), 'Hotel Orchid');
  assert.equal(cleanName('"Hotel Orchid"'), 'Hotel Orchid');
  assert.equal(cleanName('<b>Hotel</b> Orchid &amp; Spa'), 'Hotel Orchid & Spa');
  for (const bad of ['', 'Home', 'welcome', 'Untitled', 'Just a moment...', 'Access Denied', '404', 'https://hotel.com', 'www.hotel.com', 'hotel.com', 'a', 'x'.repeat(200), 'Best Cheap Hotels and Stays in Goa for Couples and Families Near the Beach', null, undefined]) assert.equal(cleanName(bad), '', String(bad));
});

test('countryName and starLabel', () => {
  assert.equal(countryName('IN'), 'India');
  assert.equal(countryName('us'), 'United States');
  assert.equal(countryName('India'), 'India');
  assert.equal(countryName('ZZ'), 'ZZ');
  assert.equal(countryName(' <b>France</b> '), 'France');
  assert.equal(starLabel(5), '5 star');
  assert.equal(starLabel(2), '2 star');
  assert.equal(starLabel(1), 'Unrated', 'there is no "1 star" in the hotel list');
  assert.equal(starLabel(0, 'Heritage / Palace'), 'Heritage / Palace');
  assert.equal(starLabel(0, 'Hotel'), 'Unrated');
  assert.equal(starLabel(undefined), 'Unrated');
});

test('isPortal: travel portals are not the hotel\'s own site', () => {
  for (const host of ['www.booking.com', 'booking.com', 'www.tripadvisor.in', 'agoda.com', 'www.makemytrip.com', 'airbnb.co.in', 'facebook.com']) assert.equal(isPortal(host), true, host);
  for (const host of ['grandlakepalace.com', 'booking-hotel-udaipur.com', 'mybooking.com.example', '']) assert.equal(isPortal(host), false, host);
});

test('agreeing sources make a fact more certain, and one weak source stays low', () => {
  const lone = merge([c('name', 'Hotel Orchid', 'title', 0.45)]);
  assert.equal(lone.hotel.name, 'Hotel Orchid');
  assert.equal(lone.fieldInfo.name.level, 'low');
  const agreed = merge([c('name', 'Hotel Orchid', 'title', 0.45), c('name', 'Hotel Orchid', 'h1', 0.42), c('name', 'Hotel Orchid', 'meta', 0.55)]);
  assert.ok(agreed.fieldInfo.name.confidence > lone.fieldInfo.name.confidence + 0.3);
  assert.equal(agreed.fieldInfo.name.agree, 3);
  assert.equal(agreed.fieldInfo.name.level, 'medium', 'a title, a heading and a meta tag agreeing is believable, not certain');
  // the same source repeated on the same page is one witness
  const repeated = merge([c('name', 'Hotel Orchid', 'text', 0.4), c('name', 'Hotel Orchid', 'text', 0.4), c('name', 'Hotel Orchid', 'text', 0.4)]);
  assert.equal(repeated.fieldInfo.name.confidence, 0.4);
  // a trusted source beats several weak ones that disagree
  const trusted = merge([c('name', 'The Grand Lake Palace', 'json-ld', 0.95), c('name', 'Home', 'title', 0.45), c('name', 'Grand Lake', 'h1', 0.42)]);
  assert.equal(trusted.hotel.name, 'The Grand Lake Palace');
});

test('a shorter name that is part of a longer one supports it, and the shorter one is preferred when equally sure', () => {
  const r = merge([c('name', 'Taj Lake Palace Udaipur', 'title', 0.45), c('name', 'Taj Lake Palace', 'meta', 0.55), c('name', 'Taj Lake Palace', 'h1', 0.42)]);
  assert.equal(r.hotel.name, 'Taj Lake Palace');
});

test('stars become a choice from the hotel list', () => {
  assert.equal(merge([c('starRating', 4, 'json-ld', 0.9)]).hotel.starRating, '4 star');
  assert.equal(merge([c('starRating', 1, 'text', 0.4)]).hotel.starRating, 'Unrated');
  assert.equal(merge([c('propertyType', 'Heritage / Palace', 'text', 0.4)]).hotel.starRating, 'Heritage / Palace');
  assert.equal(merge([c('propertyType', 'Hotel', 'json-ld', 0.9), c('starRating', 5, 'json-ld', 0.9)]).hotel.starRating, '5 star');
  assert.equal(merge([]).hotel.starRating, 'Unrated');
  assert.ok(STAR_RATINGS.includes(merge([c('starRating', 3, 'text', 0.5)]).hotel.starRating));
});

test('address: parts, the full line, a country code made into a name, and the hotel name taken off the front', () => {
  const r = merge([
    c('name', 'The Hudson Row Hotel', 'json-ld', 0.95),
    c('address.full', 'The Hudson Row Hotel, 520 W 34th St, New York, NY 10001, United States', 'text', 0.5),
    c('address.street', 'The Hudson Row Hotel, 520 W 34th St', 'text', 0.3),
    c('address.locality', 'New York', 'json-ld', 0.95),
    c('address.country', 'US', 'json-ld', 0.95)
  ]);
  assert.equal(r.hotel.address.full, '520 W 34th St, New York, NY 10001, United States');
  assert.equal(r.hotel.address.street, '520 W 34th St');
  assert.equal(r.hotel.address.locality, 'New York');
  assert.equal(r.hotel.address.country, 'United States');
  assert.equal(r.hotel.address.postalCode, '10001', 'a part that was never stated is taken from the full address');
  assert.equal(r.fieldInfo.addressParts.locality.level, 'high');
  assert.ok(r.fieldInfo.addressParts.postalCode.confidence < r.fieldInfo.address.confidence);
  const parts = merge([c('address.street', '1 Road', 'json-ld', 0.9), c('address.locality', 'Goa', 'json-ld', 0.9), c('address.country', 'India', 'json-ld', 0.9)]);
  assert.equal(parts.hotel.address.full, '1 Road, Goa, India', 'no full address: made from the parts');
});

test('phones: the same number from several places is one, shown as the best-written one, at most four', () => {
  const r = merge([
    c('phone', { display: '+91 98290 12345', digits: '919829012345', key: '9829012345' }, 'tel-link', 0.85),
    c('phone', { display: '098290 12345', digits: '09829012345', key: '9829012345' }, 'text', 0.55),
    c('phone', { display: '+91 294 242 8800', digits: '912942428800', key: '2942428800' }, 'json-ld', 0.9),
    c('phone', phone('9000000001'), 'text', 0.45), c('phone', phone('9000000002'), 'text', 0.45), c('phone', phone('9000000003'), 'text', 0.45), c('phone', phone('9000000004'), 'text', 0.45),
    c('phone', phone('9111111111'), 'embedded-json', 0.3)
  ]);
  assert.equal(r.hotel.phones.length, 4);
  assert.equal(r.hotel.phones[0].display, '+91 98290 12345', 'a number found by a link and by the words beats one found once');
  assert.equal(r.hotel.phones[1].display, '+91 294 242 8800');
  assert.equal(r.hotel.phones.filter((p) => /9829012345|98290 12345/.test(p.display)).length, 1);
  assert.ok(!r.hotel.phones.some((p) => p.display === '9111111111'), 'a weak lone number is dropped');
});

test('emails: the hotel\'s own domain first, other domains less sure, placeholders never', () => {
  const r = merge([c('email', 'info@hotel.example', 'text', 0.6), c('email', 'owner@gmail.com', 'text', 0.6), c('email', 'support@some-booking-tool.com', 'text', 0.6), c('email', 'stay@hotel.example', 'mailto-link', 0.85)]);
  assert.deepEqual(r.hotel.emails.slice(0, 2), ['stay@hotel.example', 'info@hotel.example']);
  assert.ok(r.hotel.emails.includes('owner@gmail.com'));
  assert.equal(r.hotel.emails.at(-1), 'support@some-booking-tool.com', "an address of another company on the page is probably not the hotel's: it goes last");
  assert.equal(r.fieldInfo.emails.at(-1).level, 'low');
});

test('website: the site that was read, unless it is a portal', () => {
  assert.equal(merge([]).hotel.website, 'https://hotel.example');
  const portal = mergeCandidates({ candidates: [c('website', 'https://www.grandlakepalace.example/', 'json-ld', 0.7), c('website', 'https://www.booking.com/x', 'json-ld', 0.7)], site: 'booking.com', startUrl: 'https://www.booking.com/hotel/in/x.html' });
  assert.equal(portal.hotel.website, 'https://www.grandlakepalace.example');
});

test('social: one page per network, public addresses only', () => {
  const r = merge([c('social', { network: 'facebook', url: 'https://www.facebook.com/a' }, 'link', 0.65), c('social', { network: 'facebook', url: 'https://www.facebook.com/b' }, 'json-ld', 0.8), c('social', { network: 'instagram', url: 'http://localhost/x' }, 'link', 0.65)], { publicUrl: (u) => !u.includes('localhost') });
  assert.deepEqual(r.hotel.social, [{ network: 'facebook', url: 'https://www.facebook.com/b' }]);
});

test('lists: amenities and rooms, each once, the best first', () => {
  const r = merge([
    c('amenity', 'Free Wi-Fi', 'text', 0.45), c('amenity', 'Free WiFi', 'json-ld', 0.85), c('amenity', 'Spa', 'list', 0.55), c('amenity', 'x', 'text', 0.9), c('amenity', 'Rare thing', 'text', 0.2),
    c('room', { name: 'Deluxe Room', details: '' }, 'heading', 0.5), c('room', { name: 'deluxe room', details: 'A bright room with a lake view.' }, 'json-ld', 0.85), c('room', { name: 'Suite', details: 'Big.' }, 'heading', 0.5)
  ]);
  assert.deepEqual(r.hotel.amenities, ['Free WiFi', 'Spa']);
  assert.deepEqual(r.hotel.rooms.map((x) => x.name), ['deluxe room', 'Suite']);
  assert.equal(r.hotel.rooms.length, 2);
  assert.equal(r.hotel.rooms.find((x) => x.name.toLowerCase() === 'deluxe room').details, 'A bright room with a lake view.', 'the fullest description of the same room is kept');
});

test('rates: only what a page printed, as a range with the line it came from and a reminder to check', () => {
  const r = merge([
    c('price', { currency: 'INR', from: 3500, to: 3500, unit: 'night', kind: 'text', text: 'Starting from ₹3,500 per night' }, 'text', 0.45),
    c('price', { currency: 'INR', from: 6000, to: 6000, unit: 'night', kind: 'text', text: 'From ₹6,000 per night' }, 'text', 0.45),
    c('price', { currency: 'INR', from: 800, to: 800, unit: 'person', kind: 'text', text: '₹800 per person per night' }, 'text', 0.45)
  ]);
  assert.equal(r.hotel.rates.currency, 'INR');
  assert.equal(r.hotel.rates.from, 3500);
  assert.equal(r.hotel.rates.to, 6000);
  assert.equal(r.hotel.rates.unit, 'night');
  assert.equal(r.hotel.rates.text, 'Starting from ₹3,500 per night');
  assert.equal(r.hotel.rates.lines.length, 2, 'per-person lines are not mixed into the nightly range');
  assert.match(r.hotel.rates.note, /Check it with the hotel/);
  assert.equal(merge([]).hotel.rates, null);
  assert.equal(merge([c('priceLevel', 4, 'json-ld', 0.5)]).hotel.priceLevel, 4);
  assert.equal(merge([c('price', { currency: 'INR', from: 0, to: 0, unit: 'night', text: '' }, 'text', 0.5)]).hotel.rates, null, 'a zero rate is not a rate');
  const personOnly = merge([c('price', { currency: 'USD', from: 40, to: 40, unit: 'person', kind: 'text', text: '$40 per person' }, 'text', 0.45)]);
  assert.equal(personOnly.hotel.rates.unit, 'person');
});

test('pictures: only public addresses, each once, the most likely first, at most 24', () => {
  const imgs = Array.from({ length: 40 }, (_, i) => c('image', { url: `https://hotel.example/p${i}.jpg`, alt: `<b>Photo</b> ${i}`, width: 1200, height: 800, role: 'gallery' }, 'img', 0.5 + (i % 10) / 100));
  const r = merge([...imgs, c('image', { url: 'https://hotel.example/p3.jpg', alt: '', width: 0, height: 0, role: 'page' }, 'img', 0.9), c('image', { url: 'http://localhost/secret.jpg', alt: '', width: 1600, height: 900, role: 'cover' }, 'meta', 0.99)], { publicUrl: (u) => !/localhost|127\.0\.0\.1/.test(u) });
  assert.equal(r.hotel.images.length, 24);
  assert.equal(new Set(r.hotel.images.map((i) => i.url)).size, 24);
  assert.ok(!r.hotel.images.some((i) => /localhost/.test(i.url)));
  assert.equal(r.hotel.images[0].url, 'https://hotel.example/p3.jpg', 'the most confident first');
  assert.equal(r.hotel.images[1].alt, 'Photo 9');
});

test('completeness: a score and the words for what was found and what is missing', () => {
  const empty = completeness(merge([]).hotel);
  assert.equal(empty.score, 0);
  assert.ok(empty.missing.includes('name') && empty.missing.includes('phone'));
  const rich = merge([
    c('name', 'H', 'json-ld', 0.95), c('name', 'Hotel One', 'json-ld', 0.95), c('address.locality', 'Goa', 'json-ld', 0.9), c('address.country', 'India', 'json-ld', 0.9), c('phone', phone('9829012345'), 'tel-link', 0.85), c('email', 'a@hotel.example', 'mailto-link', 0.85),
    c('description', 'A calm hotel by the sea with large rooms and a garden.', 'json-ld', 0.9), c('starRating', 4, 'json-ld', 0.9), c('room', { name: 'Deluxe Room', details: '' }, 'heading', 0.5), c('amenity', 'Spa', 'list', 0.55),
    c('price', { currency: 'INR', from: 5000, to: 5000, unit: 'night', text: 'from ₹5,000 per night' }, 'text', 0.45), c('checkIn', '14:00', 'json-ld', 0.9), c('geo', { lat: 15.5, lng: 73.7 }, 'meta', 0.75),
    ...Array.from({ length: 4 }, (_, i) => c('image', { url: `https://hotel.example/i${i}.jpg`, alt: '', width: 1200, height: 800, role: 'page' }, 'img', 0.6))
  ]);
  const done = completeness(rich.hotel);
  assert.ok(done.score >= 90 && done.score <= 100, String(done.score));
  assert.ok(done.found.includes('name') && done.found.includes('rooms'));
  assert.ok(done.found.some((f) => /check-in and check-out \(partly\)/.test(f)), 'only the check-in time was found');
  assert.deepEqual(done.missing, []);
});

test('hotelLikeness: hotel words and facts count', () => {
  const hotel = merge([c('room', { name: 'Deluxe Room', details: '' }, 'heading', 0.5), c('checkIn', '14:00', 'text', 0.6)]).hotel;
  assert.ok(hotelLikeness({ hotel, propertyTypeFound: true, words: 'Hotel Orchid rooms check-in' }) >= 5);
  assert.equal(hotelLikeness({ hotel: merge([]).hotel, propertyTypeFound: false, words: 'Grandma\'s cake recipes' }), 0);
});

// ---- property tests ----

const candidate = fc.record({
  field: fc.constantFrom('name', 'description', 'starRating', 'propertyType', 'address.full', 'address.street', 'address.locality', 'address.country', 'geo', 'phone', 'email', 'social', 'checkIn', 'checkOut', 'amenity', 'room', 'price', 'image', 'rating', 'policy.cancellation'),
  source: fc.constantFrom('json-ld', 'text', 'meta', 'h1', 'tel-link'),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  page: fc.constantFrom('https://hotel.example/', 'https://hotel.example/contact')
}).chain((base) => {
  const value = {
    name: fc.string({ maxLength: 60 }), description: fc.string({ maxLength: 300 }), starRating: fc.integer({ min: 0, max: 9 }), propertyType: fc.constantFrom('Hotel', 'Resort / Villa', 'Heritage / Palace', ''),
    'address.full': fc.string({ maxLength: 120 }), 'address.street': fc.string({ maxLength: 60 }), 'address.locality': fc.string({ maxLength: 30 }), 'address.country': fc.oneof(fc.string({ maxLength: 20 }), fc.constantFrom('IN', 'US', 'FR')),
    geo: fc.record({ lat: fc.double({ min: -90, max: 90, noNaN: true }), lng: fc.double({ min: -180, max: 180, noNaN: true }) }),
    phone: fc.stringMatching(/^[1-9]\d{9,11}$/).map((d) => ({ display: d, digits: d, key: d.slice(-10) })),
    email: fc.emailAddress(), social: fc.webUrl().map((url) => ({ network: 'facebook', url })), checkIn: fc.constantFrom('14:00', '12:00', ''), checkOut: fc.constantFrom('11:00', '10:00', ''),
    amenity: fc.string({ maxLength: 40 }), room: fc.record({ name: fc.string({ maxLength: 40 }), details: fc.string({ maxLength: 100 }) }),
    price: fc.record({ currency: fc.constantFrom('INR', 'USD', ''), from: fc.double({ min: 0, max: 1e6, noNaN: true }), to: fc.double({ min: 0, max: 1e6, noNaN: true }), unit: fc.constantFrom('night', 'person'), text: fc.string({ maxLength: 50 }) }),
    image: fc.record({ url: fc.webUrl(), alt: fc.string({ maxLength: 30 }), width: fc.integer({ min: 0, max: 4000 }), height: fc.integer({ min: 0, max: 4000 }), role: fc.constantFrom('page', 'gallery', 'room') }),
    rating: fc.record({ value: fc.double({ min: 0, max: 12, noNaN: true }), best: fc.constantFrom(5, 10), count: fc.integer({ min: 0, max: 99999 }) }),
    'policy.cancellation': fc.string({ maxLength: 100 })
  }[base.field];
  return value.map((v) => ({ ...base, value: v }));
});

test('property: merging any candidates never throws and always gives a well-formed, bounded answer', () => {
  fc.assert(
    fc.property(fc.array(candidate, { maxLength: 80 }), (candidates) => {
      const { hotel, fieldInfo } = merge(candidates);
      assert.equal(typeof hotel.name, 'string');
      assert.ok(STAR_RATINGS.includes(hotel.starRating), hotel.starRating);
      assert.ok(hotel.phones.length <= 4);
      assert.equal(new Set(hotel.phones.map((p) => p.display)).size, hotel.phones.length);
      assert.ok(hotel.emails.length <= 4);
      assert.ok(hotel.images.length <= 24);
      assert.equal(new Set(hotel.images.map((i) => i.url)).size, hotel.images.length);
      assert.ok(hotel.amenities.length <= 40 && hotel.rooms.length <= 20);
      assert.equal(new Set(hotel.amenities.map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, ''))).size, hotel.amenities.length);
      if (hotel.geo) assert.ok(Math.abs(hotel.geo.lat) <= 90 && Math.abs(hotel.geo.lng) <= 180);
      if (hotel.rates) assert.ok(hotel.rates.from > 0 && hotel.rates.to >= hotel.rates.from);
      if (hotel.guestRating) assert.ok(hotel.guestRating.value > 0 && hotel.guestRating.value <= hotel.guestRating.best);
      for (const info of Object.values(fieldInfo)) if (info && typeof info.confidence === 'number') assert.ok(info.confidence >= 0 && info.confidence <= 1);
      for (const value of [hotel.name, hotel.description, hotel.address.full, ...hotel.amenities, ...hotel.rooms.map((r) => r.name)]) assert.doesNotMatch(String(value), /[<>]/);
      const done = completeness(hotel);
      assert.ok(done.score >= 0 && done.score <= 100);
      assert.equal(done.found.length + done.missing.length >= 12 ? true : done.found.length + done.missing.length === 12, true);
    }),
    { numRuns: 400 }
  );
});

test('property: more agreeing sources never lower the confidence of a fact', () => {
  fc.assert(
    fc.property(fc.array(fc.double({ min: 0.05, max: 0.95, noNaN: true }), { minLength: 1, maxLength: 5 }), fc.double({ min: 0.05, max: 0.95, noNaN: true }), (confidences, extra) => {
      const sources = ['json-ld', 'meta', 'title', 'h1', 'text', 'list'];
      const base = confidences.map((conf, i) => c('name', 'Hotel Orchid', sources[i], conf));
      const before = merge(base).fieldInfo.name.confidence;
      const after = merge([...base, c('name', 'Hotel Orchid', 'tel-link', extra)]).fieldInfo.name.confidence;
      assert.ok(after >= before, `${before} -> ${after}`);
    }),
    { numRuns: 300 }
  );
  assert.equal(n, 0);
});

test('a postal code that the printed address does not contain is left out, and one that agrees is preferred (found on real sites)', () => {
  const full = c('address.full', 'PO Box No. 125, Udaipur 313 001, Rajasthan, India', 'json-ld', 0.8);
  const wrong = merge([full, c('address.postalCode', '302028', 'meta', 0.6)]).hotel.address;
  assert.equal(wrong.postalCode, '313001', 'the code the address itself prints wins over a stray one');
  const agreeing = merge([full, c('address.postalCode', '302028', 'meta', 0.9), c('address.postalCode', '313001', 'text', 0.4)]).hotel.address;
  assert.equal(agreeing.postalCode, '313001');
  const kept = merge([c('address.full', 'Palace Road, Jaipur 302006, India', 'json-ld', 0.8), c('address.postalCode', '302006', 'json-ld', 0.8)]).hotel.address;
  assert.equal(kept.postalCode, '302006');
});

test('the postal code is not left on the end of the town', () => {
  const a = merge([c('address.full', 'PO Box 125, Udaipur 313 001, Rajasthan, India', 'json-ld', 0.8), c('address.locality', 'Udaipur 313 001', 'json-ld', 0.8), c('address.postalCode', '313 001', 'json-ld', 0.8)]).hotel.address;
  assert.equal(a.locality, 'Udaipur');
  assert.equal(a.postalCode, '313 001');
});
