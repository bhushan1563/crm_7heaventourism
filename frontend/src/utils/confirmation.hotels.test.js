import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bookingErrors, bookingPayload, firstErrorKey, formFromConfirmation, hotelBookingsOf, hotelsOfQuote, quotationOf } from './confirmation';

// What each hotel gave once the room was booked: its confirmation number, contact number and the times.

const stay = (name, over = {}) => ({ hotelName: name, city: 'Udaipur', address: '12 Lake Road', contactNumber: '+91 294 111 2222', checkInTime: '14:00', checkOutTime: '11:00', ...over });
const confirmation = (over = {}) => ({ confirmationNo: '7H-CF-2026-001', confirmedAt: '2026-11-04T10:00:00.000Z', status: 'Confirmed', quote: { destination: 'UDAIPUR', packageDetails: { hotels: [stay('Hotel Sunrise'), stay('Hotel Moonlight', { contactNumber: '', checkInTime: '', checkOutTime: '' })] } }, ...over });
const formOf = (c) => formFromConfirmation(c);

describe('the details of each hotel in the form', () => {
  it('has one entry for each hotel of the booking, starting from what the hotel list said (contact number and usual times)', () => {
    expect(formOf(confirmation()).hotelBookings).toEqual([
      { confirmationNo: '', contactNumber: '+91 294 111 2222', checkInTime: '14:00', checkOutTime: '11:00' },
      { confirmationNo: '', contactNumber: '', checkInTime: '', checkOutTime: '' }
    ]);
  });

  it('uses what was saved for a hotel instead of the hotel list\'s, and the list\'s for a hotel with nothing saved', () => {
    const saved = confirmation({ hotelBookings: [{ confirmationNo: 'HB-2291', contactNumber: '+91 294 999 0000', checkInTime: '15:30', checkOutTime: '10:00' }] });
    expect(formOf(saved).hotelBookings[0]).toEqual({ confirmationNo: 'HB-2291', contactNumber: '+91 294 999 0000', checkInTime: '15:30', checkOutTime: '10:00' });
    expect(formOf(saved).hotelBookings[1]).toEqual({ confirmationNo: '', contactNumber: '', checkInTime: '', checkOutTime: '' });
  });

  it('is empty for a booking with no hotels (a visa, a land service), and for nothing at all', () => {
    expect(formOf(confirmation({ quote: { destination: 'DUBAI', packageDetails: {} } })).hotelBookings).toEqual([]);
    expect(formOf(undefined).hotelBookings).toEqual([]);
    expect(hotelsOfQuote(undefined)).toEqual([]);
    expect(hotelsOfQuote({ packageDetails: { hotels: 'x' } })).toEqual([]);
  });

  it('goes to the server trimmed, one entry for each hotel', () => {
    const f = formOf(confirmation());
    f.hotelBookings[0] = { confirmationNo: '  HB-2291 ', contactNumber: ' +91 294 111 2222 ', checkInTime: '14:00', checkOutTime: '11:00' };
    expect(bookingPayload(f).hotelBookings).toEqual([{ confirmationNo: 'HB-2291', contactNumber: '+91 294 111 2222', checkInTime: '14:00', checkOutTime: '11:00' }, { confirmationNo: '', contactNumber: '', checkInTime: '', checkOutTime: '' }]);
  });
});

describe('problems with a hotel\'s details', () => {
  const withHotel = (patch) => {
    const f = formOf(confirmation());
    f.hotelBookings[1] = { ...f.hotelBookings[1], ...patch };
    return f;
  };

  it('accepts what the hotel list started with, and an empty entry', () => {
    expect(bookingErrors(formOf(confirmation()))).toEqual({});
  });

  it('names the hotel and the field', () => {
    expect(bookingErrors(withHotel({ confirmationNo: 'x'.repeat(61) }))['hotel-1-no']).toBe('The confirmation number of hotel 2 is too long (the limit is 60 characters).');
    expect(bookingErrors(withHotel({ contactNumber: 'call me' }))['hotel-1-phone']).toMatch(/contact number of hotel 2 can only have digits/);
    expect(bookingErrors(withHotel({ checkInTime: '25:00' }))['hotel-1-in']).toBe('The check-in time of hotel 2 must be a time like 14:00.');
    expect(bookingErrors(withHotel({ checkOutTime: '9am' }))['hotel-1-out']).toBe('The check-out time of hotel 2 must be a time like 11:00.');
  });

  it('points at the first problem in the order the page shows them: after the travellers and before the payment', () => {
    const f = withHotel({ checkInTime: '99:99' });
    f.payment.totalAmount = -1;
    expect(firstErrorKey(bookingErrors(f), f)).toBe('hotel-1-in');
  });
});

describe('the quotation as the confirmation prints it', () => {
  it('gives each hotel what the booking holds for it: the confirmation number, the contact number and the times', () => {
    const c = confirmation({ hotelBookings: [{ confirmationNo: 'HB-2291', contactNumber: '+91 294 999 0000', checkInTime: '15:30', checkOutTime: '10:00' }] });
    const q = quotationOf(c);
    expect(q.packageDetails.hotels[0]).toMatchObject({ hotelName: 'Hotel Sunrise', bookingNo: 'HB-2291', contactNumber: '+91 294 999 0000', checkInTime: '15:30', checkOutTime: '10:00' });
    expect(q.packageDetails.hotels[1]).toMatchObject({ hotelName: 'Hotel Moonlight', bookingNo: '' });
  });

  it('shows what is on the screen when there is a form (unsaved edits), not only what was saved', () => {
    const c = confirmation();
    const f = formOf(c);
    f.hotelBookings[0] = { ...f.hotelBookings[0], confirmationNo: 'TYPED-1', checkInTime: '16:00' };
    const q = quotationOf(c, f);
    expect(q.packageDetails.hotels[0]).toMatchObject({ bookingNo: 'TYPED-1', checkInTime: '16:00' });
    expect(quotationOf(c).packageDetails.hotels[0].bookingNo).toBe(''); // the saved booking is not changed by the form
  });

  it('says it is a confirmation, so the header can say so', () => {
    expect(quotationOf(confirmation()).confirmationInfo).toEqual({ no: '7H-CF-2026-001', confirmedAt: '2026-11-04T10:00:00.000Z', status: 'Confirmed' });
  });

  it('keeps everything else of the frozen copy as it was, and never adds hotels', () => {
    const c = confirmation();
    const q = quotationOf(c);
    expect(q.destination).toBe('UDAIPUR');
    expect(q.packageDetails.hotels).toHaveLength(2);
    expect(c.quote.packageDetails.hotels[0].bookingNo).toBeUndefined(); // the stored copy is untouched
  });
});

describe('property', () => {
  it('whatever is typed, the errors are plain messages naming the hotel, and an error-free form goes to the server as strings', () => {
    const text = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom('', '14:00', '+91 98765 43210', 'x'.repeat(70), '25:61'));
    fc.assert(
      fc.property(fc.array(fc.record({ confirmationNo: text, contactNumber: text, checkInTime: text, checkOutTime: text }), { maxLength: 4 }), (hotelBookings) => {
        const f = { ...formOf(undefined), hotelBookings };
        const errors = bookingErrors(f);
        for (const [key, message] of Object.entries(errors)) {
          expect(typeof message).toBe('string');
          if (key.startsWith('hotel-')) expect(message).toMatch(/hotel \d+/);
        }
        if (!Object.keys(errors).length) {
          for (const h of bookingPayload(f).hotelBookings) expect(Object.values(h).every((v) => typeof v === 'string')).toBe(true);
        }
      }),
      { numRuns: 300 }
    );
  });
});
