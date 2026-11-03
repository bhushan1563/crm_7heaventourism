// The rates of a hotel in a hotel quotation, in the client's table: for each row (the room for 2 adults, an extra bed, a child with
// a bed, a child with no bed) the rate per room per night, the number of nights and the number of rooms, and the total of the row.
// Pure logic, no database. The browser has the same file (frontend/src/utils/hotelRates.js), and a test checks that the two always
// give the same figures, so what the editor shows is what the server stores.

export const RATE_KINDS = ['room', 'extraBed', 'childWithBed', 'childNoBed'];
export const RATE_LABELS = { room: '2 Adults', extraBed: 'Extra bed', childWithBed: 'Child With bed', childNoBed: 'Child No Bed' };
export const RATE_LIMITS = { rows: 4, label: 60, maxRate: 10_000_000, maxNights: 365, maxUnits: 999 };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The first whole number in a text such as "3 Nights" or "2 Rooms"; 0 when there is none. */
export const numberIn = (text) => {
  const match = String(text ?? '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

const unset = (value) => value === null || value === undefined || value === '';

/** The nights of a row: the one typed on the row, else the nights of the stay. */
export const rowNights = (stay, row) => (unset(row.nights) ? numberIn(stay?.nights) : Number(row.nights) || 0);

/**
 * How many rooms (or beds) a row counts: the number typed on the row, else, for the room row, the rooms of the stay (a stay that
 * does not say is one room), and for an extra bed or a child, one.
 */
export const rowUnits = (stay, row) => (unset(row.rooms) ? (row.kind === 'room' ? numberIn(stay?.noOfRooms) || 1 : 1) : Number(row.rooms) || 0);

export const rowTotal = (stay, row) => round2((Number(row.rate) || 0) * rowNights(stay, row) * rowUnits(stay, row));

/** What the whole stay costs: every row of its table added up. */
export const hotelTotal = (stay) => round2((stay?.rates || []).reduce((sum, row) => sum + rowTotal(stay, row), 0));

/** The Grand Total of an option: every hotel of the option added up. */
export const optionTotal = (option) => round2((option?.hotels || []).reduce((sum, stay) => sum + hotelTotal(stay), 0));

/** Whether an option is priced by the table (some hotel of it has rates), rather than by one price per person. */
export const optionUsesRates = (option) => (option?.hotels || []).some((stay) => (stay.rates || []).length > 0);
