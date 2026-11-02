import React from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { AMOUNT_COLUMNS, PRICE_TABLE_LIMITS as L, blankRow, blankTable, rowFinal, rowTotal, tableTotal } from '../../utils/priceTables';
import './priceTables.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;
const cell = (n) => (Number(n) > 0 ? Number(n).toLocaleString('en-IN') : '');

/**
 * The PRICING of a hotel quotation, laid out like the company's sheet: for each option a row per kind of traveller with Package,
 * Airfare, Visa and TCS per person, the Total of one person, PAX (how many) and the Final Price (Total x PAX), and a Grand Total
 * under the option. The totals are worked out as you type and are never typed. `onChange(tables)` receives the new list.
 */
export const PriceTablesEditor = ({ tables, onChange }) => {
  const setTable = (index, patch) => onChange(tables.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const setRow = (index, rowIndex, patch) => setTable(index, { rows: tables[index].rows.map((r, k) => (k === rowIndex ? { ...r, ...patch } : r)) });
  const nameOf = (table, i) => String(table.name || '').trim() || `Option ${i + 1}`;

  return (
    <div className="price-tables">
      <div className="pt-head">
        <h3 className="pt-title">Pricing</h3>
        <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange([...tables, blankTable(`Option ${tables.length + 1}`)])} disabled={tables.length >= L.tables}>
          <Plus size={14} /> <span>Add an option</span>
        </button>
      </div>
      <p className="pt-hint">
        One table for each option you offer. Fill in the amounts for one person, and PAX for how many of each kind. <strong>Total</strong> is Package + Airfare + Visa + TCS, <strong>Final Price</strong> is Total × PAX, and the Grand Total adds them up. All of it is worked out for you as you type. An option with nothing entered is not printed.
      </p>

      {tables.map((table, i) => (
        <section className="pt-card" key={i} aria-label={nameOf(table, i)}>
          <div className="pt-card-head">
            <input type="text" className="form-input pt-name" value={table.name} maxLength={L.name} placeholder={`Option ${i + 1}`} aria-label={`Name of option ${i + 1}`} onChange={(e) => setTable(i, { name: e.target.value })} />
            {/* A look-alike of the Grand Total for narrow screens, where the real one is far down the list of rows. Drawn by the style sheet from these attributes, so it is not a second copy of the figure for screen readers or text search. */}
            <span className="pt-chip" aria-hidden="true" data-label="Grand Total" data-total={money(tableTotal(table))} />
            <span className="pt-card-tools">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...tables.slice(0, i + 1), { ...table, name: `${nameOf(table, i)} (copy)`.slice(0, L.name), rows: table.rows.map((r) => ({ ...r })) }, ...tables.slice(i + 1)])} disabled={tables.length >= L.tables} title="Make another option with the same figures" aria-label={`Copy ${nameOf(table, i)}`}>
                <Copy size={13} /> <span>Copy</span>
              </button>
              <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => onChange(tables.filter((_, k) => k !== i))} disabled={tables.length <= 1} title={tables.length <= 1 ? 'A quotation needs at least one option' : 'Remove this option'} aria-label={`Remove ${nameOf(table, i)}`}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>

          <div className="pt-scroll">
            <table className="pt-grid">
              <colgroup>
                <col className="pt-col-label" />
                {AMOUNT_COLUMNS.map(([key]) => (
                  <col key={key} className="pt-col-amount" />
                ))}
                <col className="pt-col-total" />
                <col className="pt-col-pax" />
                <col className="pt-col-final" />
                <col className="pt-col-remove" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Sr No</th>
                  {AMOUNT_COLUMNS.map(([key, title]) => (
                    <th scope="col" key={key}>{title}</th>
                  ))}
                  <th scope="col">Total</th>
                  <th scope="col">PAX</th>
                  <th scope="col">Final Price</th>
                  <th scope="col"><span className="sr-only">Remove the row</span></th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => {
                  const rowName = String(row.label || '').trim() || `row ${r + 1}`;
                  return (
                    <tr key={r}>
                      <th scope="row">
                        <input type="text" className="form-input pt-label" value={row.label} maxLength={L.label} placeholder="e.g. Adult" aria-label={`Name of row ${r + 1} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { label: e.target.value })} />
                      </th>
                      {AMOUNT_COLUMNS.map(([key, title]) => (
                        <td key={key} data-label={title}>
                          <input type="number" min={0} step="any" inputMode="decimal" className="form-input pt-num" value={row[key]} aria-label={`${title} of ${rowName} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { [key]: e.target.value })} />
                        </td>
                      ))}
                      <td className="pt-calc" data-label="Total" aria-label={`Total of ${rowName} in ${nameOf(table, i)}`}>{cell(rowTotal(row))}</td>
                      <td data-label="PAX">
                        <input type="number" min={0} max={L.maxPax} step={1} inputMode="numeric" className="form-input pt-num pt-pax" value={row.pax} aria-label={`PAX of ${rowName} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { pax: e.target.value })} />
                      </td>
                      <td className="pt-calc pt-final" data-label="Final Price" aria-label={`Final Price of ${rowName} in ${nameOf(table, i)}`}>{cell(rowFinal(row))}</td>
                      <td className="pt-remove">
                        <button type="button" className="btn-icon btn-outline" onClick={() => setTable(i, { rows: table.rows.filter((_, k) => k !== r) })} disabled={table.rows.length <= 1} aria-label={`Remove ${rowName} from ${nameOf(table, i)}`} title="Remove this row">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={7} className="pt-grand-label">Grand Total</th>
                  <td className="pt-grand" aria-live="polite">{money(tableTotal(table))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <button type="button" className="btn btn-outline btn-sm pt-add-row" onClick={() => setTable(i, { rows: [...table.rows, blankRow()] })} disabled={table.rows.length >= L.rows}>
            <Plus size={13} /> <span>Add a row</span>
          </button>
        </section>
      ))}
    </div>
  );
};

export default PriceTablesEditor;
