import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { blankOption, duplicateOption, optionsProblem, repriceOptions, startHotelOptions } from './quotationOptions';
import { addRateRow, patchRateRow, startRates } from './rateTable';
import { optionTotal } from './hotelRates';

// Options of a hotel quotation priced by the rate tables of their hotels (the client's sheet).

const stay = (name, rate, over = {}) => ({ hotelName: name, hotelId: '0123456789abcdef01234567', nights: '3 Nights', noOfRooms: '2 Rooms', rates: patchRateRow(startRates(), 'room', { rate }), ...over });
const two = () => [{ ...blankOption(1), hotels: [stay('A', 5000), stay('B', 4000, { nights: '2 Nights', noOfRooms: '1 Room' })] }, { ...blankOption(2), hotels: [stay('C', 7000)] }];

describe('repriceOptions with rate tables', () => {
  it('the total of an option is the Grand Total of its tables, and the price per person is that shared by the guests', () => {
    const [first, second] = repriceOptions(two(), '2 Adults');
    expect(first.totalPrice).toBe(30000 + 8000);
    expect(first.pricePerPerson).toBe(19000);
    expect(second.totalPrice).toBe(42000);
    expect(second.pricePerPerson).toBe(21000);
  });

  it('follows the guests: more guests, the same total, a smaller price per person', () => {
    const [one] = repriceOptions(two(), '2 Adults');
    const [other] = repriceOptions(two(), '4 Adults');
    expect(other.totalPrice).toBe(one.totalPrice);
    expect(other.pricePerPerson).toBe(9500);
  });

  it('follows every change of a table: a rate, an extra row, the nights of the stay', () => {
    let options = two();
    options[0].hotels[0].rates = addRateRow(options[0].hotels[0].rates, 'extraBed');
    options[0].hotels[0].rates = patchRateRow(options[0].hotels[0].rates, 'extraBed', { rate: 1500 });
    expect(repriceOptions(options, '2 Adults')[0].totalPrice).toBe(30000 + 4500 + 8000); // an extra bed counts one for each of the 3 nights
    options = two();
    options[0].hotels[0].nights = '5 Nights';
    expect(repriceOptions(options, '2 Adults')[0].totalPrice).toBe(50000 + 8000);
  });

  it('leaves an option with no table exactly as before: the price per person times the guests', () => {
    const old = { ...blankOption(1), hotels: [{ hotelName: 'Old', nights: '2 Nights' }], pricePerPerson: 25000 };
    const [out] = repriceOptions([old], '2 Adults');
    expect(out.totalPrice).toBe(50000);
    expect(out.pricePerPerson).toBe(25000);
  });

  it('prices each option on its own', () => {
    const old = { ...blankOption(3), hotels: [{ hotelName: 'Old' }], pricePerPerson: 10000 };
    const out = repriceOptions([...two(), old], '2 Adults');
    expect(out.map((o) => o.totalPrice)).toEqual([38000, 42000, 20000]);
  });
});

describe('optionsProblem with rate tables', () => {
  const base = (options) => ({ quotationType: 'Only Hotel', options: repriceOptions(options, '2 Adults'), paxDetails: '2 Adults' });

  it('accepts options whose every hotel has a room rate', () => {
    expect(optionsProblem(base(two()))).toBeNull();
  });

  it('asks for the room rate of a hotel that has none, naming the option and the hotel', () => {
    const options = two();
    options[1].hotels = [stay('C', 0)];
    expect(optionsProblem(base(options))).toBe('Option 2, hotel 1: please enter the room rate per night.');
    options[0].hotels[1] = stay('B', 0);
    expect(optionsProblem(base(options))).toBe('Option 1, hotel 2: please enter the room rate per night.');
  });

  it('does not accept a table that adds up to nothing, and says what to look at', () => {
    const options = two();
    options[0].hotels[0] = stay('A', 5000, { nights: '' });
    expect(optionsProblem(base(options))).toBe('Option 1, hotel 1: the rates give a total of 0. Please check the nights and the number of rooms.');
  });

  it('does not ask for a price per person any more when the tables are filled in', () => {
    const q = base(two());
    expect(q.options.every((o) => o.pricePerPerson > 0)).toBe(true);
    expect(optionsProblem({ ...q, options: q.options.map((o) => ({ ...o, pricePerPerson: 0 })) })).toBeNull(); // the per person price is only a figure derived from the tables
  });

  it('still asks for the price per person of an older option that has no tables', () => {
    const old = [{ ...blankOption(1), hotels: [{ hotelId: '0123456789abcdef01234567', hotelName: 'Old' }], pricePerPerson: 0 }, { ...blankOption(2), hotels: [{ hotelId: '0123456789abcdef01234567', hotelName: 'Old' }], pricePerPerson: 20000 }];
    expect(optionsProblem({ quotationType: 'Only Hotel', options: old })).toBe('Please enter the price per person of Option 1.');
  });
});

describe('starting a hotel quotation', () => {
  it('gives the hotel it already has a room rate row, so the table is ready to fill in', () => {
    const start = startHotelOptions({ paxDetails: '2 Adults', packageDetails: { hotels: [{ hotelName: 'Taj', hotelId: 'x', nights: '2 Nights' }] } });
    expect(start.options).toHaveLength(2);
    expect(start.options[0].hotels[0].rates).toEqual(startRates());
    expect(start.options[1].hotels).toEqual([]);
    expect(start.packageDetails.hotels).toEqual([]);
  });

  it('keeps a table the hotel already has, and leaves a quotation that already has options exactly as it is', () => {
    const kept = patchRateRow(startRates(), 'room', { rate: 6000 });
    const start = startHotelOptions({ paxDetails: '2 Adults', packageDetails: { hotels: [{ hotelName: 'Taj', nights: '2 Nights', rates: kept }] } });
    expect(start.options[0].hotels[0].rates).toEqual(kept);
    expect(startHotelOptions({ options: two() })).toEqual({});
  });
});

describe('copying an option', () => {
  it('copies the tables too, so changing the copy never changes the original', () => {
    const options = repriceOptions(two(), '2 Adults');
    const copied = duplicateOption(options, 0);
    expect(copied).toHaveLength(3);
    copied[1].hotels[0].rates[0].rate = 1;
    expect(options[0].hotels[0].rates[0].rate).toBe(5000);
  });
});

describe('property', () => {
  it('the total of an option is always the sum of its hotels\' tables, whatever the rates, nights and rooms', () => {
    const rate = fc.integer({ min: 0, max: 20000 });
    const hotel = fc.record({ nights: fc.constantFrom('1 Night', '2 Nights', '7 Nights'), noOfRooms: fc.constantFrom('1 Room', '2 Rooms', '4 Rooms'), room: rate, bed: rate, withBed: rate });
    fc.assert(
      fc.property(fc.array(hotel, { minLength: 1, maxLength: 4 }), fc.constantFrom('1 Adult', '2 Adults', '5 Adults + 2 Children'), (hotels, pax) => {
        const built = hotels.map((h) => {
          let rates = patchRateRow(startRates(), 'room', { rate: h.room });
          rates = patchRateRow(addRateRow(addRateRow(rates, 'extraBed'), 'childWithBed'), 'extraBed', { rate: h.bed });
          rates = patchRateRow(rates, 'childWithBed', { rate: h.withBed });
          return { hotelName: 'H', nights: h.nights, noOfRooms: h.noOfRooms, rates };
        });
        const [out] = repriceOptions([{ ...blankOption(1), hotels: built }], pax);
        const by = (n) => parseInt(n, 10);
        const expected = hotels.reduce((sum, h) => sum + h.room * by(h.nights) * by(h.noOfRooms) + h.bed * by(h.nights) + h.withBed * by(h.nights), 0);
        expect(out.totalPrice).toBe(expected);
        expect(out.totalPrice).toBe(optionTotal({ hotels: built }));
        expect(out.pricePerPerson).toBeGreaterThanOrEqual(0);
        expect(Math.abs(out.pricePerPerson * parseInt(pax, 10) - out.totalPrice)).toBeLessThan(parseInt(pax, 10)); // the share, rounded to paise
      }),
      { numRuns: 300 }
    );
  });
});
