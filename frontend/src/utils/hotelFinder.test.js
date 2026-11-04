import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkAddress, foundCsvRows, foundFileName, foundFromFind, foundSections, foundToHotelForm, mapUrl, missingForHotel, money, paragraphsHtml, ratesText, timeWords } from './hotelFinder';

const found = (over = {}) => ({
  name: 'Palm Grove Resort', propertyType: 'Resort', starRating: '4 star', tagline: 'By the sea', description: 'A beachside resort.\n\nTwo pools & a spa.',
  address: { full: '12 Candolim Beach Road, Candolim, Goa 403515, India', street: '12 Candolim Beach Road', locality: 'Candolim', region: 'Goa', postalCode: '403515', country: 'India' },
  geo: { lat: 15.5, lng: 73.76 }, phones: ['+91 832 227 5599'], emails: ['stay@palmgrove.com'], website: 'https://palmgrove.com', social: [{ network: 'facebook', url: 'https://www.facebook.com/palmgrove' }],
  checkIn: '14:00', checkOut: '11:00', amenities: ['Pool', 'Spa'], rooms: [{ name: 'Sea View Room', details: 'A bright room.' }],
  rates: { currency: 'INR', from: 6500, to: 9000, unit: 'night', text: 'From Rs 6,500 per night', note: 'As printed.', lines: [{ text: 'From Rs 6,500 per night', from: 6500, to: 6500, unit: 'night' }] },
  guestRating: { value: 4.5, best: 5, count: 1200 }, policies: { cancellation: 'Free until 7 days before.', children: '', pets: '' }, photos: [], notes: '', sourceUrl: 'https://palmgrove.com/', foundAt: '2026-11-04T10:00:00Z', completeness: { score: 71, found: ['name'], missing: ['pictures'] }, warnings: ['Check the rates.'], ...over
});

describe('checkAddress: a mistake is shown at once, before the server is asked', () => {
  it('accepts ordinary addresses as typed', () => {
    for (const ok of ['example-hotel.com', 'www.example-hotel.com/rooms', 'https://Example-Hotel.com', '  http://hotel.co.in  ', '//hotel.com/x']) expect(checkAddress(ok).ok, ok).toBe(true);
  });
  it('says in words what is wrong', () => {
    const cases = [['', /paste the hotel's website address/i], ['   ', /paste the hotel's website address/i], ['two words', /space/], ['javascript:alert(1)', /http/], ['file:///etc/passwd', /http/], ['mailto:a@b.com', /http/], ['http://user:pw@hotel.com', /user name or password/], ['hotel', /website name/], ['hotel..com', /website name/], ['http://', /does not look like/], [`https://hotel.com/${'a'.repeat(2100)}`, /too long/], [undefined, /paste the hotel's website address/i]];
    for (const [input, message] of cases) {
      const r = checkAddress(input);
      expect(r.ok, String(input)).toBe(false);
      expect(r.message).toMatch(message);
    }
  });
  it('never throws on anything', () => {
    fc.assert(fc.property(fc.anything(), (v) => typeof checkAddress(v).ok === 'boolean'), { numRuns: 300 });
    fc.assert(fc.property(fc.string(), (s) => { const r = checkAddress(s); return r.ok ? typeof r.url === 'string' : r.message.length > 0; }), { numRuns: 500 });
  });
});

describe('words for numbers', () => {
  it('money and rates', () => {
    expect(money('INR', 3500)).toBe('Rs 3,500');
    expect(money('USD', 189)).toBe('USD 189');
    expect(money('', 500)).toBe('Rs 500');
    expect(money('AED', 400)).toBe('AED 400');
    expect(ratesText({ currency: 'INR', from: 3500, to: 6000, unit: 'night' })).toBe('Rs 3,500 to Rs 6,000 a night');
    expect(ratesText({ currency: 'USD', from: 40, to: 40, unit: 'person' })).toBe('USD 40 per person');
    expect(ratesText(null)).toBe('');
    expect(ratesText({ currency: 'INR', from: 0 })).toBe('');
  });
  it('times and map links', () => {
    expect(timeWords('14:00')).toBe('2:00 PM');
    expect(timeWords('00:30')).toBe('12:30 AM');
    expect(timeWords('12:00')).toBe('12:00 PM');
    expect(timeWords('')).toBe('');
    expect(timeWords('banana')).toBe('');
    expect(mapUrl({ lat: 15.5, lng: 73.7 })).toBe('https://www.google.com/maps?q=15.5,73.7');
    expect(mapUrl(null)).toBe('');
    expect(mapUrl({ lat: NaN, lng: 1 })).toBe('');
  });
});

describe('foundFromFind: a find becomes the record to save', () => {
  const data = {
    sourceUrl: 'https://palmgrove.com/', source: 'website', completeness: { score: 71, found: ['name'], missing: ['pictures'] }, warnings: ['<b>Check</b> the rates.'],
    pages: [{ url: 'https://palmgrove.com/', label: 'The address you gave', kind: 'start' }, { url: '', label: 'x' }],
    fieldInfo: { name: { level: 'high' }, address: { level: 'medium' }, phones: [{ level: 'high' }], emails: [{ level: 'low' }], rooms: null },
    hotel: { ...found(), phones: [{ display: '+91 832 227 5599', note: '', level: 'high' }], images: [{ url: 'https://palmgrove.com/a.jpg', preview: '/finder-image/x' }] }
  };
  it('keeps the facts, flattens phones, notes where it came from and how sure it was', () => {
    const f = foundFromFind(data, { photos: [{ token: 'tok', width: 1, height: 1 }] });
    expect(f.name).toBe('Palm Grove Resort');
    expect(f.phones).toEqual(['+91 832 227 5599']);
    expect(f.source).toBe('website');
    expect(f.sourceUrl).toBe('https://palmgrove.com/');
    expect(f.warnings).toEqual(['Check the rates.']);
    expect(f.pagesRead).toEqual([{ url: 'https://palmgrove.com/', label: 'The address you gave' }]);
    expect(f.fieldLevels).toEqual({ name: 'high', address: 'medium', phones: 'high', emails: 'low' });
    expect(f.photos).toEqual([{ token: 'tok', width: 1, height: 1 }]);
    expect(f.images).toBeUndefined();
    expect(f.rates.lines).toEqual([{ text: 'From Rs 6,500 per night', from: 6500, to: 6500, unit: 'night' }]);
  });
  it('takes the person\'s edits, and marks pasted text as pasted', () => {
    const f = foundFromFind({ ...data, source: 'pasted' }, { edits: { name: 'Palm Grove Resort & Spa' } });
    expect(f.name).toBe('Palm Grove Resort & Spa');
    expect(f.source).toBe('pasted');
  });
});

describe('foundToHotelForm: a saved find becomes the hotel form, with nothing invented', () => {
  it('fills what it can and leaves the rest', () => {
    const form = foundToHotelForm(found({ photos: [{ token: 't', width: 10, height: 10, caption: 'Front' }] }));
    expect(form).toMatchObject({ name: 'Palm Grove Resort', city: 'Candolim', country: 'India', starRating: '4 star', phone: '+91 832 227 5599', email: 'stay@palmgrove.com', website: 'https://palmgrove.com', checkInTime: '14:00', checkOutTime: '11:00', area: '' });
    expect(form.address).toBe('12 Candolim Beach Road, Candolim, Goa, 403515');
    expect(form.description).toBe('<p>A beachside resort.</p><p>Two pools &amp; a spa.</p>');
    expect(form.amenities).toEqual(['Pool', 'Spa']);
    expect(form.photos).toEqual([{ token: 't', width: 10, height: 10, caption: 'Front' }]);
    expect(form.cancellationPolicy).toBe('<p>Free until 7 days before.</p>');
    expect(form.notes).toContain('Found with the hotel finder at https://palmgrove.com/.');
    expect(form.notes).toContain('Rates as printed there: From Rs 6,500 per night');
    expect(form.notes).toContain('Check them with the hotel before quoting.');
  });
  it('an incomplete find leaves the required fields empty and says which', () => {
    const form = foundToHotelForm(found({ address: { full: '', street: '', locality: '', region: '', postalCode: '', country: '' }, checkIn: '', checkOut: '' }), { checkInTime: '14:00', checkOutTime: '11:00' });
    expect(form.city).toBe('');
    expect(form.checkInTime).toBe('14:00');
    expect(missingForHotel(form)).toEqual([{ key: 'city', label: 'the city' }]);
    expect(missingForHotel({ name: ' ', city: '' }).map((m) => m.key)).toEqual(['name', 'city']);
    expect(missingForHotel(foundToHotelForm(found()))).toEqual([]);
  });
  it('respects the hotel list\'s limits and escapes everything', () => {
    const form = foundToHotelForm(found({ name: 'N'.repeat(300), address: { locality: 'C'.repeat(300), country: 'K'.repeat(300), full: '' }, amenities: Array.from({ length: 60 }, (_, i) => `Amenity number ${i} with a rather long name indeed`), description: '<script>x</script> & <b>' }));
    expect(form.name.length).toBe(150);
    expect(form.city.length).toBe(100);
    expect(form.country.length).toBe(80);
    expect(form.amenities.length).toBe(40);
    expect(form.amenities.every((a) => a.length <= 40)).toBe(true);
    expect(form.description).toBe('<p>&lt;script&gt;x&lt;/script&gt; &amp; &lt;b&gt;</p>');
    expect(paragraphsHtml('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
    expect(paragraphsHtml('')).toBe('');
  });
});

describe('the downloads: sections and rows', () => {
  it('sections leave empty facts out and keep the order of a hotel sheet', () => {
    const sections = foundSections(found());
    expect(sections.map((s) => s.title)).toEqual(['Hotel', 'About', 'Contact', 'Location', 'Stay', 'Rooms', 'Amenities', 'Rates', 'Policies', 'Source']);
    expect(sections[0].rows).toContainEqual(['Guest rating', '4.5 out of 5 (1,200 reviews)']);
    expect(sections.find((s) => s.title === 'Stay').rows).toEqual([['Check-in', '2:00 PM'], ['Check-out', '11:00 AM']]);
    expect(sections.find((s) => s.title === 'Policies').rows).toEqual([['Cancellation', 'Free until 7 days before.']]);
    expect(foundSections({ name: 'Only A Name' }).map((s) => s.title)).toEqual(['Hotel']);
    expect(foundSections({}).length).toBe(0);
  });
  it('CSV rows: one fact per row with its section', () => {
    const rows = foundCsvRows(found());
    expect(rows[0]).toEqual({ Section: 'Hotel', Field: 'Name', Value: 'Palm Grove Resort' });
    expect(rows).toContainEqual({ Section: 'Amenities', Field: 'Item 1', Value: 'Pool' });
    expect(rows).toContainEqual({ Section: 'Source', Field: 'Warning 1', Value: 'Check the rates.' });
    expect(rows).toContainEqual({ Section: 'Rooms', Field: 'Item 1', Value: 'Sea View Room: A bright room.' });
    expect(rows.every((r) => r.Section && r.Field && r.Value !== '')).toBe(true);
  });
  it('file names are safe', () => {
    expect(foundFileName(found(), 'pdf')).toBe('Palm-Grove-Resort-details.pdf');
    expect(foundFileName({ name: 'Café "Ünï" / <Inn>: ../../etc' }, 'docx')).toMatch(/^[\w-]+-details\.docx$/);
    expect(foundFileName({}, 'csv')).toBe('hotel-details.csv');
    expect(foundFileName({ name: '???' }, 'csv')).toBe('hotel-details.csv');
  });
  it('property: any found hotel gives sections without blanks and CSV rows of three non-empty columns', () => {
    const arb = fc.record({ name: fc.string({ maxLength: 40 }), description: fc.string({ maxLength: 200 }), amenities: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 8 }), phones: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }), notes: fc.string({ maxLength: 50 }) });
    fc.assert(fc.property(arb, (f) => {
      for (const s of foundSections(f)) for (const [label, value] of s.rows) expect(label && value).toBeTruthy();
      for (const r of foundCsvRows(f)) expect(r.Section && r.Field && r.Value).toBeTruthy();
    }), { numRuns: 300 });
  });
});
