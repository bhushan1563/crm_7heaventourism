// The pricing tables of a hotel or package quotation, in the two layouts the client uses. Pure functions (no network, no React) so every
// rule can be tested; the server repeats the checks.
//
// "sheet" (a hotel quotation, "Only Hotel"): for each option a row per kind of traveller (Adult, Extra bed, CWB, CNB) with Package,
// Airfare, Visa and TCS per person, their Total, PAX (the number of persons) and the Final Price (Total x PAX), and a Grand Total under
// the option.
//
// "rooms" (a package quotation): for each option a row per kind of guest (For 2 Adults, Extra bed, Child With bed, Child No Bed) with the
// rate per room per night, the nights, the rooms and the Total of the row, and a Grand Total under the option (see roomTables.js, the same
// file the server uses).
//
// Only the typed figures are stored; every Total, Final Price and Grand Total is worked out from them. A quotation made before the tables
// came back keeps its per-person price list (and can switch to the tables, or back).
import { ROOM_ROW_LABELS, ROOM_TABLE_LIMITS, roomDefaults, roomTableHasData, roomTableTotal } from './roomTables';
import { typedCount } from './rateTable';

export const PRICE_TABLE_LIMITS = { tables: 6, rows: 10, name: 60, label: 40, maxAmount: 1_000_000_000, maxPax: 999 };
export const AMOUNT_COLUMNS = [['package', 'Package'], ['airfare', 'Airfare'], ['visa', 'Visa'], ['tcs', 'TCS']];
export const DEFAULT_ROW_LABELS = ['Adult', 'Extra bed', 'CWB', 'CNB'];
export { ROOM_ROW_LABELS };

export const HOTEL = 'Only Hotel';
/** Which layout a kind of quotation is priced with (nothing for the others: a land service, a visa ... have their own pricing). */
export const LAYOUT_OF_TYPE = { [HOTEL]: 'sheet', Package: 'rooms' };
export const layoutOf = (quotation) => LAYOUT_OF_TYPE[quotation?.quotationType || 'Package'] || null;
export const tableLayout = (table) => table?.layout || 'sheet'; // a table made before there were two layouts is a sheet

/** The tables of a quotation that are laid out the way its kind of quotation is priced (the others are never used). */
export const tablesOf = (quotation) => {
  const layout = layoutOf(quotation);
  return layout ? (quotation?.priceTables || []).filter((table) => tableLayout(table) === layout) : [];
};
export const usesPriceTables = (quotation) => tablesOf(quotation).length > 0;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

export const blankRow = (label = '') => ({ label, package: '', airfare: '', visa: '', tcs: '', pax: '' });
export const blankRoomRow = (label = '') => ({ label, rate: '', nights: '', rooms: '' });
/** A new option in one of the two layouts, with the rows of the client's sheet. */
export const blankTable = (name, layout = 'sheet') =>
  layout === 'rooms' ? { name, layout, rows: ROOM_ROW_LABELS.map(blankRoomRow) } : { name, layout: 'sheet', rows: DEFAULT_ROW_LABELS.map(blankRow) };

/**
 * What a hotel or package quotation starts with: two options (Option 1, Option 2, the usual way to offer a 3 star and a 4 star choice),
 * or one for each of the hotel options it already has, named after them. Empty for a kind of quotation that has no pricing table.
 */
export const startPriceTables = (quotation) => {
  const layout = layoutOf(quotation);
  if (!layout) return [];
  const options = (quotation?.options || []).slice(0, PRICE_TABLE_LIMITS.tables);
  const names = options.length >= 2 ? options.map((o, i) => String(o?.name || '').trim() || `Option ${i + 1}`) : ['Option 1', 'Option 2'];
  return names.map((name) => blankTable(name, layout));
};

/**
 * What `priceTables` becomes when a quotation takes the kind `type`: nothing changes for a kind that has no tables, or when the quotation
 * already has tables laid out for it; otherwise it gets the usual two options. Tables of the other layout are kept after them, so
 * switching from a package to a hotel and back loses nothing.
 */
export const startPricingFor = (quotation, type) => {
  const q = { ...quotation, quotationType: type };
  if (!layoutOf(q) || tablesOf(q).length) return {};
  return { priceTables: [...startPriceTables(q), ...(quotation?.priceTables || [])] };
};

/** The whole list of tables once the ones the quotation uses (shown in the editor) have been changed; the others stay at the end. */
export const withTables = (quotation, mine) => [...mine, ...(quotation?.priceTables || []).filter((table) => tableLayout(table) !== layoutOf(quotation))];

// ---- the sheet ----
export const rowTotal = (row) => round2(AMOUNT_COLUMNS.reduce((sum, [key]) => sum + (Number(row?.[key]) || 0), 0));
export const rowFinal = (row) => round2(rowTotal(row) * (Number(row?.pax) || 0));
const sheetTotal = (table) => round2((table?.rows || []).reduce((sum, row) => sum + rowFinal(row), 0));
const sheetHasData = (table) => (table?.rows || []).some((row) => AMOUNT_COLUMNS.some(([key]) => Number(row[key]) > 0) || Number(row.pax) > 0);

/**
 * What an option comes to. A "rooms" option whose nights are left empty follows the length of the trip, so the quotation (its duration)
 * is needed for it; a sheet needs nothing else.
 */
export const tableTotal = (table, quotation) => (tableLayout(table) === 'rooms' ? roomTableTotal(table, roomDefaults(quotation)) : sheetTotal(table));
export const tableHasData = (table) => (tableLayout(table) === 'rooms' ? roomTableHasData(table) : sheetHasData(table));

/** The options that have something entered, with their number in the whole list (what the server wants when one is chosen). */
export const filledTables = (quotation) => {
  const layout = layoutOf(quotation);
  return (quotation?.priceTables || []).map((table, index) => ({ table, index })).filter(({ table }) => layout && tableLayout(table) === layout && tableHasData(table));
};

/** The lowest Grand Total among the filled-in options (what a list shows as "from"), or 0. */
export const lowestTotal = (quotation) => {
  const totals = filledTables(quotation).map(({ table }) => tableTotal(table, quotation)).filter((t) => t > 0);
  return totals.length ? Math.min(...totals) : 0;
};

/** What a quotation list shows for a quotation priced with the tables: the lowest Grand Total, and what that means, or null. */
export const listPrice = (quotation) => {
  if (!usesPriceTables(quotation)) return null;
  const filled = filledTables(quotation);
  if (!filled.length) return { amount: 0, note: 'Pricing not filled in' };
  return { amount: lowestTotal(quotation), note: filled.length > 1 ? `From, ${filled.length} options` : 'Grand Total' };
};

/** True when confirming needs a choice among several filled-in pricing options. */
export const needsPriceTableChoice = (quotation) => usesPriceTables(quotation) && filledTables(quotation).length > 1;

/** What a cell shows: nothing for an empty cell, like the sheet. */
export const cellText = (value) => (Number(value) > 0 ? Number(value).toLocaleString('en-IN') : '');

const isNumber = (v) => v === '' || v === null || v === undefined || (Number.isFinite(Number(v)) && String(v).trim() !== '');
const isCount = (v, max) => v === '' || v === null || v === undefined || (isNumber(v) && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= max);

/**
 * What stops the pricing tables from being saved, in plain words, or null: an amount that is not an amount, a PAX, a number of nights or
 * rooms that is not a whole number, a row without a name. Only applies to a quotation that uses the tables.
 */
export const priceTablesProblem = (quotation) => {
  if (!usesPriceTables(quotation)) return null;
  const L = PRICE_TABLE_LIMITS;
  const R = ROOM_TABLE_LIMITS;
  for (const [i, table] of tablesOf(quotation).entries()) {
    const name = String(table.name || '').trim() || `Option ${i + 1}`;
    if (name.length > L.name) return `The name of ${name.slice(0, 20)}… is too long (the limit is ${L.name} characters).`;
    for (const [r, row] of (table.rows || []).entries()) {
      const label = String(row.label || '').trim();
      if (!label) return `Please enter a name for row ${r + 1} of ${name}, or remove that row.`;
      if (tableLayout(table) === 'rooms') {
        if (!isNumber(row.rate) || Number(row.rate) < 0 || Number(row.rate) > R.maxRate) return `The rate per room per night of "${label}" in ${name} must be an amount from 0 to ${rs(R.maxRate)}.`;
        if (!isCount(row.nights, R.maxNights)) return `The number of nights of "${label}" in ${name} must be a whole number from 0 to ${R.maxNights}.`;
        if (!isCount(row.rooms, R.maxRooms)) return `The number of rooms of "${label}" in ${name} must be a whole number from 0 to ${R.maxRooms}.`;
        continue;
      }
      for (const [key, title] of AMOUNT_COLUMNS) {
        const v = row[key];
        if (!isNumber(v) || Number(v) < 0 || Number(v) > L.maxAmount) return `The ${title} of "${label}" in ${name} must be an amount from 0 to ${rs(L.maxAmount)}.`;
      }
      const pax = row.pax;
      if (!isNumber(pax) || !Number.isInteger(Number(pax) || 0) || Number(pax) < 0 || Number(pax) > L.maxPax) return `The PAX of "${label}" in ${name} must be a whole number from 0 to ${L.maxPax}.`;
    }
  }
  return null;
};

/** The tables as the server wants them (numbers, tidy text; nights and rooms left empty stay empty: they follow the trip). */
export const priceTablesPayload = (tables) =>
  (tables || []).map((table, i) => {
    const name = String(table.name || '').trim() || `Option ${i + 1}`;
    if (tableLayout(table) === 'rooms') {
      return {
        name,
        layout: 'rooms',
        rows: (table.rows || []).map((row) => ({ label: String(row.label || '').trim(), rate: Number(row.rate) || 0, nights: typedCount(row.nights, ROOM_TABLE_LIMITS.maxNights), rooms: typedCount(row.rooms, ROOM_TABLE_LIMITS.maxRooms) }))
      };
    }
    return {
      name,
      layout: 'sheet',
      rows: (table.rows || []).map((row) => ({ label: String(row.label || '').trim(), package: Number(row.package) || 0, airfare: Number(row.airfare) || 0, visa: Number(row.visa) || 0, tcs: Number(row.tcs) || 0, pax: Number(row.pax) || 0 }))
    };
  });
