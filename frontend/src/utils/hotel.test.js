import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AMENITY_RULES, HOTEL_LIMITS, STAR_OPTIONS, cleanWebsite, emptyHotel, firstErrorKey, starLabel, toPayload, validateHotel } from './hotel';
import { addTag } from './itinerary';

const filled = (over = {}) => ({ ...emptyHotel(), name: 'The Ubud Retreat', city: 'Ubud', ...over });

describe('validateHotel', () => {
  it('accepts a hotel with just a name and a city', () => {
    expect(validateHotel(filled())).toEqual({});
  });

  it('asks for the name and the city in plain words', () => {
    expect(validateHotel(emptyHotel())).toEqual({ name: 'Please enter the name of the hotel.', city: 'Please enter the city.' });
    expect(validateHotel(filled({ name: '   ', city: '  ' }))).toMatchObject({ name: 'Please enter the name of the hotel.', city: 'Please enter the city.' });
  });

  it('explains limits with the real numbers', () => {
    expect(validateHotel(filled({ name: 'x'.repeat(151) })).name).toBe('The name is too long (151 characters; the limit is 150).');
    expect(validateHotel(filled({ city: 'x'.repeat(101) })).city).toMatch(/limit is 100/);
  });

  it('checks phone, email, website and times without being fussy about what is acceptable', () => {
    expect(validateHotel(filled({ phone: '+91 98765-43210', email: 'a@b.co', website: 'www.hotel.com', checkInTime: '00:00', checkOutTime: '23:59' }))).toEqual({});
    expect(validateHotel(filled({ phone: 'call me' })).phone).toMatch(/only contain digits/);
    expect(validateHotel(filled({ email: 'nope' })).email).toMatch(/does not look right/);
    expect(validateHotel(filled({ website: 'javascript:alert(1)' })).website).toMatch(/Example: https:\/\/www\.example\.com/);
    expect(validateHotel(filled({ checkInTime: '' })).checkInTime).toMatch(/like 14:00/);
    expect(validateHotel(filled({ checkOutTime: '25:00' })).checkOutTime).toMatch(/like 11:00/);
  });

  it('checks each room type and says which one', () => {
    const errors = validateHotel(filled({ roomTypes: [{ name: 'Suite', details: '' }, { name: '  ', details: '' }, { name: 'suite', details: '' }, { name: 'Villa', details: 'x'.repeat(201) }] }));
    expect(errors['room-0']).toBeUndefined();
    expect(errors['room-1']).toBe('Please enter a name for room type 2, or remove it.');
    expect(errors['room-2']).toBe('"suite" is listed twice. Please keep it once.');
    expect(errors['room-3']).toMatch(/details of room type 4 are too long/);
  });

  it('picks the first problem to show, in reading order', () => {
    const form = filled({ name: '', phone: 'x', roomTypes: [{ name: '', details: '' }] });
    expect(firstErrorKey(validateHotel(form), form)).toBe('name');
    const onlyRoom = filled({ roomTypes: [{ name: '', details: '' }] });
    expect(firstErrorKey(validateHotel(onlyRoom), onlyRoom)).toBe('room-0');
    expect(firstErrorKey({}, filled())).toBeNull();
  });
});

describe('cleanWebsite', () => {
  it('adds https:// when it is missing, drops a trailing slash, and refuses anything that is not a web address', () => {
    expect(cleanWebsite('www.hotel.com/')).toBe('https://www.hotel.com');
    expect(cleanWebsite('http://hotel.in/rooms')).toBe('http://hotel.in/rooms');
    expect(cleanWebsite('')).toBe('');
    for (const bad of ['javascript:alert(1)', 'ftp://x.com', 'not a site', 'localhost', 'data:text/html,hi']) expect(cleanWebsite(bad), bad).toBeNull();
  });
});

describe('toPayload', () => {
  it('sends only what the server stores (photos as token and caption)', () => {
    const payload = toPayload(filled({ photos: [{ token: 'T'.repeat(24), width: 5, height: 5, caption: undefined }], roomTypes: [{ name: 'Suite' }] }));
    expect(payload.photos).toEqual([{ token: 'T'.repeat(24), caption: '' }]);
    expect(payload.roomTypes).toEqual([{ name: 'Suite', details: '' }]);
    expect(Object.keys(payload).sort()).toEqual(Object.keys(emptyHotel()).sort());
  });
});

describe('ratings and amenity rules', () => {
  it('has a friendly label for every rating and a fallback', () => {
    for (const s of STAR_OPTIONS) expect(starLabel(s.value)).toBe(s.label);
    expect(starLabel(undefined)).toBe('Not rated');
  });
  it('lets amenities keep their capitals and stops at 40', () => {
    expect(addTag(['Pool'], 'rooftop BAR', AMENITY_RULES).tags).toEqual(['Pool', 'rooftop BAR']);
    expect(addTag(Array.from({ length: HOTEL_LIMITS.amenities }, (_, i) => `a${i}`), 'one more', AMENITY_RULES).error).toBe('A hotel can have at most 40 amenities.');
  });
});

describe('property', () => {
  it('validateHotel never throws, and a form with no errors always has a name and a city', () => {
    const text = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom('', '   ', '14:00', 'a@b.co', 'www.x.com', '+91 1234 5678', 'x'.repeat(200)));
    const room = fc.record({ name: fc.string({ maxLength: 20 }), details: fc.string({ maxLength: 20 }) });
    fc.assert(
      fc.property(fc.record({ name: text, city: text, phone: text, email: text, website: text, checkInTime: text, checkOutTime: text, roomTypes: fc.array(room, { maxLength: 4 }) }), (over) => {
        const form = { ...emptyHotel(), ...over };
        const errors = validateHotel(form);
        if (Object.keys(errors).length === 0) {
          expect(form.name.trim().length).toBeGreaterThan(0);
          expect(form.city.trim().length).toBeGreaterThan(0);
        }
        expect(Object.values(errors).every((m) => typeof m === 'string' && m.length > 5)).toBe(true);
      }),
      { numRuns: 400 }
    );
  });
});

describe('the pricing tables of a hotel', () => {
  const row = (label, over = {}) => ({ label, package: 18000, airfare: '', visa: '', tcs: '', pax: 2, ...over });
  it('a new hotel starts with Option 1 and Option 2, each with Adult, Extra bed, CWB and CNB', () => {
    const form = emptyHotel();
    expect(form.priceTables.map((t) => t.name)).toEqual(['Option 1', 'Option 2']);
    expect(form.priceTables[0].rows.map((r) => r.label)).toEqual(['Adult', 'Extra bed', 'CWB', 'CNB']);
    expect(emptyHotel().priceTables).not.toBe(form.priceTables); // each form has its own
  });
  it('are sent as numbers with tidy names, and renaming an option is part of the payload', () => {
    const form = { ...emptyHotel(), name: 'Taj', city: 'Udaipur', priceTables: [{ name: ' Deluxe room ', rows: [row('Adult', { package: '18000', pax: '2' })] }] };
    expect(toPayload(form).priceTables).toEqual([{ name: 'Deluxe room', rows: [{ label: 'Adult', package: 18000, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }]);
  });
  it('are checked before saving, in plain words naming the option and the row', () => {
    const form = { ...emptyHotel(), name: 'Taj', city: 'Udaipur' };
    expect(validateHotel(form).priceTables).toBeUndefined();
    const bad = { ...form, priceTables: [{ name: 'Suite', rows: [row('Adult', { pax: '1.5' })] }] };
    expect(validateHotel(bad).priceTables).toBe('The PAX of "Adult" in Suite must be a whole number from 0 to 999.');
    expect(firstErrorKey(validateHotel(bad), bad)).toBe('priceTables');
    const both = { ...bad, city: '' };
    expect(firstErrorKey(validateHotel(both), both)).toBe('city'); // the basics come first
  });
});

describe('a quotation made from a hotel', () => {
  it('brings the hotel\'s prices when it has any, and nothing when it has none', async () => {
    const { quotationFromHotel } = await import('./hotelStay');
    const priced = { _id: 'h1', name: 'Taj', city: 'Udaipur', priceTables: [{ name: 'Suite', rows: [{ label: 'Adult', package: 30000, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }] };
    expect(quotationFromHotel(priced).priceTables.map((t) => t.name)).toEqual(['Suite']);
    expect(quotationFromHotel({ _id: 'h2', name: 'Plain', city: 'Goa' }).priceTables).toBeNull();
  });
});
