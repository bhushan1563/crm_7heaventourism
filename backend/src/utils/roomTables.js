// The "rooms" layout of a pricing table, as the client's second sheet: a row per kind of guest (For 2 Adults, Extra bed, Child With bed,
// Child No Bed) with the rate per room per night, the number of nights, the number of rooms and the Total of the row, and a Grand Total
// under the table. Only the typed figures are stored; every Total and the Grand Total are worked out from them, so they can never
// disagree. The nights and the rooms may be left empty: the nights then follow the length of the trip (its duration, "5 Nights / 6
// Days") and the rooms are one. Pure logic, no database. The browser has the same file (frontend/src/utils/roomTables.js) and a test
// checks that the two are identical, so what the editor shows is what the server stores and what a booking is made for.

export const ROOM_TABLE_LIMITS = { maxRate: 10_000_000, maxNights: 365, maxRooms: 999 };
export const ROOM_ROW_LABELS = ['For 2 Adults', 'Extra bed', 'Child With bed', 'Child No Bed'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const unset = (value) => value === null || value === undefined || value === '';

/** The first whole number in a text such as "5 Nights / 6 Days"; 0 when there is none. */
export const numberIn = (text) => {
  const match = String(text ?? '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

/** What a row falls back to when its nights are left empty: the nights of the trip. */
export const roomDefaults = (quotation) => ({ nights: numberIn(quotation?.duration) });

export const roomRowNights = (row, defaults) => (unset(row?.nights) ? Number(defaults?.nights) || 0 : Number(row.nights) || 0);
export const roomRowRooms = (row) => (unset(row?.rooms) ? 1 : Number(row.rooms) || 0);

/** What the row comes to: the rate per room per night times the nights times the rooms. */
export const roomRowTotal = (row, defaults) => round2((Number(row?.rate) || 0) * roomRowNights(row, defaults) * roomRowRooms(row));

/** What the whole table comes to: every row added up. */
export const roomTableTotal = (table, defaults) => round2((table?.rows || []).reduce((sum, row) => sum + roomRowTotal(row, defaults), 0));

/** True when any rate was entered: a table with nothing entered is not printed. */
export const roomTableHasData = (table) => (table?.rows || []).some((row) => Number(row?.rate) > 0);
