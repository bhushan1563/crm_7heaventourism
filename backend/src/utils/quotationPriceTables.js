import { line } from './itineraryInput.js';

// The pricing tables of a hotel quotation, in the layout the client uses: for each option (Option 1, Option 2 ...) a row per kind of
// traveller (Adult, Extra bed, CWB, CNB) with the Package, Airfare, Visa and TCS amounts per person, their Total, the number of
// persons (PAX) and the Final Price (Total x PAX), and a Grand Total under the option. Only the typed amounts and PAX are stored;
// every Total, Final Price and Grand Total is worked out from them, so the figures can never disagree. Pure logic (no database).

export const PRICE_TABLE_LIMITS = { tables: 6, rows: 10, name: 60, label: 40, maxAmount: 1_000_000_000, maxPax: 999 };
export const AMOUNT_COLUMNS = [['package', 'Package'], ['airfare', 'Airfare'], ['visa', 'Visa'], ['tcs', 'TCS']];

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;
const blank = (v) => v === undefined || v === null || v === '';

/** What one person of this kind costs: Package + Airfare + Visa + TCS. */
export const rowTotal = (row) => round2(AMOUNT_COLUMNS.reduce((sum, [key]) => sum + (Number(row?.[key]) || 0), 0));
/** What the row comes to: the Total of one person times the number of persons. */
export const rowFinal = (row) => round2(rowTotal(row) * (Number(row?.pax) || 0));
/** What the option comes to: the Final Price of all its rows. */
export const tableTotal = (table) => round2((table?.rows || []).reduce((sum, row) => sum + rowFinal(row), 0));
/** True when anything has been entered: an empty option is not printed. */
export const tableHasData = (table) => (table?.rows || []).some((row) => AMOUNT_COLUMNS.some(([key]) => Number(row[key]) > 0) || Number(row.pax) > 0);

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
    if (!Array.isArray(raw.rows)) return fail(`${tableName} needs a list of rows.`);
    if (raw.rows.length > L.rows) return fail(`${tableName} can have at most ${L.rows} rows (there are ${raw.rows.length}).`);
    const rows = [];
    for (const [rowIndex, rawRow] of raw.rows.entries()) {
      if (!isPlainObject(rawRow)) return fail(`Row ${rowIndex + 1} of ${tableName} is not valid.`);
      const label = line(rawRow.label, `a name for row ${rowIndex + 1} of ${tableName}`, L.label, { required: true });
      if (!label.ok) return label;
      const row = { label: label.value };
      for (const [key, title] of AMOUNT_COLUMNS) {
        const v = rawRow[key];
        const amount = blank(v) ? 0 : typeof v === 'number' || typeof v === 'string' ? Number(v) : Number.NaN;
        if (!Number.isFinite(amount) || amount < 0 || amount > L.maxAmount) {
          return fail(`The ${title} of "${label.value}" in ${tableName} must be an amount from 0 to Rs ${L.maxAmount.toLocaleString('en-IN')}.`);
        }
        row[key] = round2(amount);
      }
      const p = rawRow.pax;
      const pax = blank(p) ? 0 : typeof p === 'number' || typeof p === 'string' ? Number(p) : Number.NaN;
      if (!Number.isInteger(pax) || pax < 0 || pax > L.maxPax) return fail(`The PAX of "${label.value}" in ${tableName} must be a whole number from 0 to ${L.maxPax}.`);
      row.pax = pax;
      rows.push(row);
    }
    tables.push({ name: tableName, rows });
  }
  return { ok: true, value: tables };
};
