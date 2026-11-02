// The pricing tables of a hotel quotation, in the layout the client uses: for each option a row per kind of traveller (Adult, Extra
// bed, CWB, CNB) with Package, Airfare, Visa and TCS per person, their Total, PAX (the number of persons) and the Final Price
// (Total x PAX), and a Grand Total under the option. Only the typed amounts and PAX are stored; every Total, Final Price and Grand
// Total is worked out from them. Pure functions (no network, no React) so every rule can be tested; the server repeats the checks.

export const PRICE_TABLE_LIMITS = { tables: 6, rows: 10, name: 60, label: 40, maxAmount: 1_000_000_000, maxPax: 999 };
export const AMOUNT_COLUMNS = [['package', 'Package'], ['airfare', 'Airfare'], ['visa', 'Visa'], ['tcs', 'TCS']];
export const DEFAULT_ROW_LABELS = ['Adult', 'Extra bed', 'CWB', 'CNB'];

export const HOTEL = 'Only Hotel';
export const usesPriceTables = (quotation) => (quotation?.quotationType || '') === HOTEL && (quotation?.priceTables || []).length > 0;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

export const blankRow = (label = '') => ({ label, package: '', airfare: '', visa: '', tcs: '', pax: '' });
export const blankTable = (name) => ({ name, rows: DEFAULT_ROW_LABELS.map(blankRow) });

/** What a new hotel quotation starts with: Option 1 and Option 2, as on the client's sheet (an empty option is never printed). */
export const startPriceTables = (quotation = {}) => ({ priceTables: (quotation.priceTables || []).length ? quotation.priceTables : [blankTable('Option 1'), blankTable('Option 2')] });

export const rowTotal = (row) => round2(AMOUNT_COLUMNS.reduce((sum, [key]) => sum + (Number(row?.[key]) || 0), 0));
export const rowFinal = (row) => round2(rowTotal(row) * (Number(row?.pax) || 0));
export const tableTotal = (table) => round2((table?.rows || []).reduce((sum, row) => sum + rowFinal(row), 0));
export const tableHasData = (table) => (table?.rows || []).some((row) => AMOUNT_COLUMNS.some(([key]) => Number(row[key]) > 0) || Number(row.pax) > 0);

/** The options that have something entered, with their number in the whole list (what the server wants when one is chosen). */
export const filledTables = (quotation) => (quotation?.priceTables || []).map((table, index) => ({ table, index })).filter(({ table }) => tableHasData(table));

/** The lowest Grand Total among the filled-in options (what a list shows as "from"), or 0. */
export const lowestTotal = (quotation) => {
  const totals = filledTables(quotation).map(({ table }) => tableTotal(table)).filter((t) => t > 0);
  return totals.length ? Math.min(...totals) : 0;
};

/** True when any option of these tables has something entered. */
export const hasPriceData = (tables) => (tables || []).some(tableHasData);

/**
 * The pricing tables of a hotel of the hotel list, as a hotel quotation starts with them: a copy of all of them (names included) when
 * the hotel has any prices entered, else null (the quotation then starts with the usual empty Option 1 and Option 2).
 */
export const tablesFromHotel = (hotel) => {
  const tables = hotel?.priceTables || [];
  if (!hasPriceData(tables)) return null;
  return tables.map((table) => ({ name: table.name || '', rows: (table.rows || []).map((row) => ({ ...row })) }));
};

/** What a quotation list shows for a hotel quotation priced with the tables: the lowest Grand Total, and what that means, or null. */
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

/**
 * What stops the pricing tables from being saved, in plain words, or null: an amount that is not an amount, a PAX that is not a whole
 * number, a row without a name. Only applies to a hotel quotation that uses the tables.
 */
export const priceTablesProblem = (quotation) => {
  if (!usesPriceTables(quotation)) return null;
  const L = PRICE_TABLE_LIMITS;
  for (const [i, table] of quotation.priceTables.entries()) {
    const name = String(table.name || '').trim() || `Option ${i + 1}`;
    if (name.length > L.name) return `The name of ${name.slice(0, 20)}… is too long (the limit is ${L.name} characters).`;
    for (const [r, row] of (table.rows || []).entries()) {
      const label = String(row.label || '').trim();
      if (!label) return `Please enter a name for row ${r + 1} of ${name}, or remove that row.`;
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

/** The tables as the server wants them (numbers, tidy text). */
export const priceTablesPayload = (tables) =>
  (tables || []).map((table, i) => ({
    name: String(table.name || '').trim() || `Option ${i + 1}`,
    rows: (table.rows || []).map((row) => ({ label: String(row.label || '').trim(), package: Number(row.package) || 0, airfare: Number(row.airfare) || 0, visa: Number(row.visa) || 0, tcs: Number(row.tcs) || 0, pax: Number(row.pax) || 0 }))
  }));
