import { line } from './itineraryInput.js';
import { ROOM_TABLE_LIMITS, ROOM_ROW_LABELS, roomTableHasData, roomTableTotal } from './roomTables.js';

// The pricing tables of a hotel or package quotation, in the two layouts the client uses. Pure logic (no database).
//
// "sheet" (a hotel quotation): for each option (Option 1, Option 2 ...) a row per kind of traveller (Adult, Extra bed, CWB, CNB) with the
// Package, Airfare, Visa and TCS amounts per person, their Total, the number of persons (PAX) and the Final Price (Total x PAX), and a
// Grand Total under the option.
//
// "rooms" (a package quotation): for each option a row per kind of guest (For 2 Adults, Extra bed, Child With bed, Child No Bed) with the
// rate per room per night, the nights, the rooms and the Total of the row, and a Grand Total under the option (see roomTables.js).
//
// Only the typed figures are stored; every Total, Final Price and Grand Total is worked out from them, so the figures can never disagree.

export const PRICE_TABLE_LIMITS = { tables: 6, rows: 10, name: 60, label: 40, maxAmount: 1_000_000_000, maxPax: 999 };
export const AMOUNT_COLUMNS = [['package', 'Package'], ['airfare', 'Airfare'], ['visa', 'Visa'], ['tcs', 'TCS']];
export const TABLE_LAYOUTS = ['sheet', 'rooms'];
/** Which layout a kind of quotation is priced with (nothing for the others: they have their own pricing). */
export const LAYOUT_OF_TYPE = { 'Only Hotel': 'sheet', Package: 'rooms' };

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;
const blank = (v) => v === undefined || v === null || v === '';

/** What one person of this kind costs: Package + Airfare + Visa + TCS. */
export const rowTotal = (row) => round2(AMOUNT_COLUMNS.reduce((sum, [key]) => sum + (Number(row?.[key]) || 0), 0));
/** What the row comes to: the Total of one person times the number of persons. */
export const rowFinal = (row) => round2(rowTotal(row) * (Number(row?.pax) || 0));

/**
 * What the option comes to: the Final Price of all its rows ("sheet"), or the Total of all its rows ("rooms"). `defaults` is what a
 * "rooms" row falls back to when its nights are left empty (see roomDefaults in roomTables.js).
 */
export const tableTotal = (table, defaults) =>
  table?.layout === 'rooms' ? roomTableTotal(table, defaults) : round2((table?.rows || []).reduce((sum, row) => sum + rowFinal(row), 0));

/** True when anything has been entered: an empty option is not printed. */
export const tableHasData = (table) =>
  table?.layout === 'rooms' ? roomTableHasData(table) : (table?.rows || []).some((row) => AMOUNT_COLUMNS.some(([key]) => Number(row[key]) > 0) || Number(row.pax) > 0);

const wholeNumber = (raw, max) => {
  if (blank(raw)) return { ok: true, value: null }; // not typed: it follows the trip
  const n = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= max ? { ok: true, value: n } : { ok: false };
};

const sheetRow = (rawRow, label, tableName, rowIndex) => {
  const L = PRICE_TABLE_LIMITS;
  const row = { label };
  for (const [key, title] of AMOUNT_COLUMNS) {
    const v = rawRow[key];
    const amount = blank(v) ? 0 : typeof v === 'number' || typeof v === 'string' ? Number(v) : Number.NaN;
    if (!Number.isFinite(amount) || amount < 0 || amount > L.maxAmount) {
      return fail(`The ${title} of "${label}" in ${tableName} must be an amount from 0 to Rs ${L.maxAmount.toLocaleString('en-IN')}.`);
    }
    row[key] = round2(amount);
  }
  const p = rawRow.pax;
  const pax = blank(p) ? 0 : typeof p === 'number' || typeof p === 'string' ? Number(p) : Number.NaN;
  if (!Number.isInteger(pax) || pax < 0 || pax > L.maxPax) return fail(`The PAX of "${label}" in ${tableName} must be a whole number from 0 to ${L.maxPax}.`);
  row.pax = pax;
  return { ok: true, value: row, rowIndex };
};

const roomsRow = (rawRow, label, tableName) => {
  const R = ROOM_TABLE_LIMITS;
  const v = rawRow.rate;
  const rate = blank(v) ? 0 : typeof v === 'number' || typeof v === 'string' ? Number(v) : Number.NaN;
  if (!Number.isFinite(rate) || rate < 0 || rate > R.maxRate) return fail(`The rate per room per night of "${label}" in ${tableName} must be an amount from 0 to Rs ${R.maxRate.toLocaleString('en-IN')}.`);
  const nights = wholeNumber(rawRow.nights, R.maxNights);
  if (!nights.ok) return fail(`The number of nights of "${label}" in ${tableName} must be a whole number from 0 to ${R.maxNights}.`);
  const rooms = wholeNumber(rawRow.rooms, R.maxRooms);
  if (!rooms.ok) return fail(`The number of rooms of "${label}" in ${tableName} must be a whole number from 0 to ${R.maxRooms}.`);
  return { ok: true, value: { label, rate: round2(rate), nights: nights.value, rooms: rooms.value } };
};

/**
 * @param {unknown} value the `priceTables` of a request
 * @returns {{ ok: true, value: object[] } | { ok: false, message: string }}
 */
export const normalizeQuotationPriceTables = (value) => {
  const L = PRICE_TABLE_LIMITS;
  if (!Array.isArray(value)) return fail('The pricing tables must be a list.');
  if (value.length > L.tables) return fail(`A quotation can have at most ${L.tables} pricing options (there are ${value.length}).`);
  const tables = [];
  for (const [index, raw] of value.entries()) {
    const n = index + 1;
    if (!isPlainObject(raw)) return fail(`Pricing option ${n} is not valid.`);
    const name = line(raw.name, `the name of pricing option ${n}`, L.name);
    if (!name.ok) return name;
    const tableName = name.value || `Option ${n}`;
    const layout = blank(raw.layout) ? 'sheet' : raw.layout; // a table made before there were two layouts is a sheet
    if (!TABLE_LAYOUTS.includes(layout)) return fail(`${tableName} must be laid out as the sheet or as rooms.`);
    if (!Array.isArray(raw.rows)) return fail(`${tableName} needs a list of rows.`);
    if (raw.rows.length > L.rows) return fail(`${tableName} can have at most ${L.rows} rows (there are ${raw.rows.length}).`);
    const rows = [];
    for (const [rowIndex, rawRow] of raw.rows.entries()) {
      if (!isPlainObject(rawRow)) return fail(`Row ${rowIndex + 1} of ${tableName} is not valid.`);
      const label = line(rawRow.label, `a name for row ${rowIndex + 1} of ${tableName}`, L.label, { required: true });
      if (!label.ok) return label;
      const row = layout === 'rooms' ? roomsRow(rawRow, label.value, tableName) : sheetRow(rawRow, label.value, tableName, rowIndex);
      if (!row.ok) return row;
      rows.push(row.value);
    }
    tables.push({ name: tableName, layout, rows });
  }
  return { ok: true, value: tables };
};

export { ROOM_ROW_LABELS };
