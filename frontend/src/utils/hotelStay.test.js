import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { STAY_LIMITS, blankStay, hotelDestination, hotelQuotationProblem, isPlaceholderTitle, quotationFromHotel, stayFromHotel } from './hotelStay';

const photo = (n) => ({ token: `${n}`.padStart(24, 'p'), width: 1600, height: 1000, caption: `c${n}` });
const hotel = (over = {}) => ({
  _id: '0123456789abcdef01234567', name: 'The Ubud Retreat', city: 'Ubud', country: 'Indonesia', area: 'Centre', address: 'Jalan Raya 12', starRating: '5 star',
  phone: '+62 361 123', contactPerson: 'Desk', email: 'a@b.co', checkInTime: '14:00', checkOutTime: '11:00',
  photos: [photo(1), photo(2)], amenities: ['Pool', 'Spa'], roomTypes: [{ name: 'Deluxe Room', details: 'King' }, { name: 'Suite', details: '' }], mealPlans: ['MAP (Breakfast & Dinner)'], ...over
});

describe('stayFromHotel', () => {
  it('copies what the hotel shows and keeps what belongs to this booking', () => {
    const current = { ...blankStay(), nights: '3 Nights', checkInDate: '2027-01-10', checkOutDate: '2027-01-13', noOfRooms: '2 Rooms', notes: 'Honeymoon' };
    const stay = stayFromHotel(hotel(), current);
    expect(stay).toMatchObject({ hotelId: '0123456789abcdef01234567', hotelName: 'The Ubud Retreat', city: 'Ubud', starRating: '5 star', address: 'Jalan Raya 12', contactNumber: '+62 361 123', contactPerson: 'Desk', email: 'a@b.co', checkInTime: '14:00', checkOutTime: '11:00' });
    expect(stay).toMatchObject({ nights: '3 Nights', checkInDate: '2027-01-10', checkOutDate: '2027-01-13', noOfRooms: '2 Rooms', notes: 'Honeymoon' });
    expect(stay.photos).toEqual([photo(1), photo(2)]);
    expect(stay.amenities).toEqual(['Pool', 'Spa']);
    expect(stay.roomOptions).toEqual(['Deluxe Room', 'Suite']);
  });

  it('keeps the room the user chose when the hotel has it, otherwise starts from its first room type', () => {
    expect(stayFromHotel(hotel(), { ...blankStay(), roomCategory: 'Suite' }).roomCategory).toBe('Suite');
    expect(stayFromHotel(hotel(), blankStay()).roomCategory).toBe('Deluxe Room');
    expect(stayFromHotel(hotel(), { ...blankStay(), roomCategory: 'Penthouse' }).roomCategory).toBe('Deluxe Room');
    expect(stayFromHotel(hotel({ roomTypes: [] }), { ...blankStay(), roomCategory: 'My own room' }).roomCategory).toBe('My own room');
  });

  it('uses a meal plan the hotel offers, and leaves the current one when the hotel has not said', () => {
    expect(stayFromHotel(hotel(), blankStay()).mealPlan).toBe('MAP (Breakfast & Dinner)');
    expect(stayFromHotel(hotel({ mealPlans: [] }), { ...blankStay(), mealPlan: 'AP (All Meals)' }).mealPlan).toBe('AP (All Meals)');
    expect(stayFromHotel(hotel({ mealPlans: ['AP (All Meals)', 'CP (Breakfast Only)'] }), blankStay()).mealPlan).toBe('CP (Breakfast Only)');
  });

  it('copes with a bare hotel (nothing but a name and a city)', () => {
    const stay = stayFromHotel({ _id: 'x'.repeat(24), name: 'Plain Inn', city: 'Goa' });
    expect(stay).toMatchObject({ hotelName: 'Plain Inn', city: 'Goa', starRating: 'Unrated', address: '', contactNumber: '', photos: [], amenities: [], roomOptions: [], checkInTime: '', checkOutTime: '' });
    expect(stay.roomCategory).toBe('Deluxe Room');
  });

  it('falls back to the area when there is no street address, and never copies more than the server allows', () => {
    expect(stayFromHotel(hotel({ address: '' }), blankStay()).address).toBe('Centre');
    const big = hotel({ photos: Array.from({ length: 12 }, (_, i) => photo(i)), amenities: Array.from({ length: 60 }, (_, i) => `a${i}`), roomTypes: Array.from({ length: 40 }, (_, i) => ({ name: `R${i}` })) });
    const stay = stayFromHotel(big);
    expect([stay.photos.length, stay.amenities.length, stay.roomOptions.length]).toEqual([STAY_LIMITS.photos, STAY_LIMITS.amenities, STAY_LIMITS.roomOptions]);
  });

  it('gives the quotation its own copy: changing the stay never changes the hotel', () => {
    const source = hotel();
    const snapshot = JSON.stringify(source);
    const stay = stayFromHotel(source);
    stay.photos[0].caption = 'changed';
    stay.photos.push(photo(9));
    stay.amenities.push('Gym');
    stay.roomOptions[0] = 'changed';
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('keeps only what a stay stores (nothing else from the hotel leaks into the quotation)', () => {
    const stay = stayFromHotel(hotel({ notes: 'INTERNAL: best rate with Raj', cancellationPolicy: 'x', tags: ['t'], createdByName: 'Someone' }));
    expect(JSON.stringify(stay)).not.toMatch(/INTERNAL|createdByName/);
    expect(stay.notes).toBe(''); // the stay's own notes, not the hotel's internal notes
  });
});

describe('quotationFromHotel', () => {
  it('starts a hotel quotation titled with the DESTINATION (the city), not the hotel, with the stay filled in', () => {
    const draft = quotationFromHotel(hotel());
    expect(draft).toMatchObject({ quotationType: 'Only Hotel', destination: 'UBUD', duration: '1 Night / 2 Days' });
    expect(draft.destination).not.toMatch(/RETREAT/);
    expect(draft.stay.hotelId).toBe('0123456789abcdef01234567');
    expect(draft.stay.hotelName).toBe('The Ubud Retreat'); // the hotel itself still comes below the destination
  });
  it('falls back to the hotel name only when the hotel has no city, so the title is never empty', () => {
    expect(hotelDestination({ name: 'Plain Inn', city: '' })).toBe('PLAIN INN');
    expect(hotelDestination({ name: 'Plain Inn', city: '   ' })).toBe('PLAIN INN');
    expect(hotelDestination({ name: 'Taj Lake Palace', city: ' Udaipur ' })).toBe('UDAIPUR');
    expect(hotelDestination({})).toBe('');
  });
  it('knows which titles are only placeholders', () => {
    expect(isPlaceholderTitle('')).toBe(true);
    expect(isPlaceholderTitle('LUXURY HOTEL BOOKING')).toBe(true);
    expect(isPlaceholderTitle('UDAIPUR')).toBe(false);
    expect(isPlaceholderTitle('TAJ LAKE PALACE, UDAIPUR')).toBe(false); // an older title is a real one: it is never replaced
  });
});

describe('hotelQuotationProblem', () => {
  const linked = { hotelName: 'A', hotelId: '0123456789abcdef01234567' };
  it('only applies to hotel quotations', () => {
    for (const type of ['Package', 'Events / Corporate', undefined]) expect(hotelQuotationProblem({ quotationType: type, packageDetails: { hotels: [{ hotelName: 'typed' }] } })).toBeNull();
  });
  it('asks for a hotel when there is none, and for the list when one was typed by hand, naming which', () => {
    expect(hotelQuotationProblem({ quotationType: 'Only Hotel', packageDetails: { hotels: [] } })).toMatch(/needs a hotel.*hotel list/);
    expect(hotelQuotationProblem({ quotationType: 'Only Hotel' })).toMatch(/needs a hotel/);
    expect(hotelQuotationProblem({ quotationType: 'Only Hotel', packageDetails: { hotels: [linked, { hotelName: 'typed' }] } })).toMatch(/Hotel stay 2 was typed by hand/);
    expect(hotelQuotationProblem({ quotationType: 'Only Hotel', packageDetails: { hotels: [linked, linked] } })).toBeNull();
  });
});

describe('property', () => {
  it('whatever the hotel looks like, the stay obeys the limits and keeps the booking details', () => {
    const text = fc.string({ maxLength: 20 });
    const h = fc.record({ _id: fc.constant('0123456789abcdef01234567'), name: text, city: text, photos: fc.array(fc.constant(0).map(() => photo(Math.floor(Math.random() * 1e6))), { maxLength: 15 }), amenities: fc.array(text, { maxLength: 60 }), roomTypes: fc.array(fc.record({ name: text }), { maxLength: 40 }), mealPlans: fc.array(fc.constantFrom('CP (Breakfast Only)', 'AP (All Meals)'), { maxLength: 2 }) }, { requiredKeys: ['_id', 'name', 'city'] });
    fc.assert(
      fc.property(h, text, (hotelValue, notes) => {
        const stay = stayFromHotel(hotelValue, { ...blankStay(), nights: '4 Nights', notes });
        expect(stay.photos.length).toBeLessThanOrEqual(STAY_LIMITS.photos);
        expect(stay.amenities.length).toBeLessThanOrEqual(STAY_LIMITS.amenities);
        expect(stay.roomOptions.length).toBeLessThanOrEqual(STAY_LIMITS.roomOptions);
        expect(stay.nights).toBe('4 Nights');
        expect(stay.notes).toBe(notes);
        expect(stay.hotelId).toBe(hotelValue._id);
      }),
      { numRuns: 300 }
    );
  });
});
