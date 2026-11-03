import React from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { AMOUNT_COLUMNS, PRICE_TABLE_LIMITS as L, ROOM_ROW_LABELS, blankRoomRow, blankRow, blankTable, rowFinal, rowTotal, tableLayout, tableTotal } from '../../utils/priceTables';
import { ROOM_TABLE_LIMITS as R, roomDefaults, roomRowNights, roomRowRooms, roomRowTotal } from '../../utils/roomTables';
import './priceTables.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;
const cell = (n) => (Number(n) > 0 ? Number(n).toLocaleString('en-IN') : '');

/**
 * The PRICING of a hotel or package quotation, laid out like the company's sheets, one card for each option you offer (Option 1 = the
 * 3 star choice, Option 2 = the 4 star ...). Every Total, Final Price and Grand Total is worked out as you type and is never typed.
 *
 * A hotel quotation uses the SHEET: a row per kind of traveller with Package, Airfare, Visa and TCS per person, the Total of one person,
 * PAX (how many) and the Final Price (Total x PAX). A package quotation uses ROOMS: a row per kind of guest (For 2 Adults, Extra bed,
 * Child With bed, Child No Bed) with the rate per room per night, the nights, the rooms and the Total. The card, the names, the copy and
 * remove buttons and the Grand Total are the same in both. `onChange(tables)` receives the new list; `quotation` gives the rooms layout
 * the length of the trip (the nights a row follows while its nights are left empty).
 */
export const PriceTablesEditor = ({ tables, onChange, quotation }) => {
  const setTable = (index, patch) => onChange(tables.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const setRow = (index, rowIndex, patch) => setTable(index, { rows: tables[index].rows.map((r, k) => (k === rowIndex ? { ...r, ...patch } : r)) });
  const nameOf = (table, i) => String(table.name || '').trim() || `Option ${i + 1}`;
  const layout = tableLayout(tables[0]);
  const defaults = roomDefaults(quotation);

  // A new row of a rooms table is the next of the client's rows that the table does not have yet (Extra bed, Child With bed ...).
  const nextRoomLabel = (table) => ROOM_ROW_LABELS.find((label) => !table.rows.some((r) => String(r.label || '').trim().toLowerCase() === label.toLowerCase())) || '';

  return (
    <div className={`price-tables is-${layout}`}>
      <div className="pt-head">
        <h3 className="pt-title">Pricing</h3>
        <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange([...tables, blankTable(`Option ${tables.length + 1}`, layout)])} disabled={tables.length >= L.tables}>
          <Plus size={14} /> <span>Add an option</span>
        </button>
      </div>
      {layout === 'rooms' ? (
        <p className="pt-hint">
          One table for each option you offer, for example a 3 star and a 4 star package. Fill in the <strong>rate per room per night</strong>; the nights follow your trip unless you type them, and rooms start at one. <strong>Total</strong> is the rate × nights × rooms, and the Grand Total adds them up. All of it is worked out for you as you type. Take out the rows you do not need (Extra bed, Child With bed, Child No Bed are optional); an option with nothing entered is not printed.
        </p>
      ) : (
        <p className="pt-hint">
          One table for each option you offer. Fill in the amounts for one person, and PAX for how many of each kind. <strong>Total</strong> is Package + Airfare + Visa + TCS, <strong>Final Price</strong> is Total × PAX, and the Grand Total adds them up. All of it is worked out for you as you type. An option with nothing entered is not printed.
        </p>
      )}

      {tables.map((table, i) => (
        <section className="pt-card" key={i} aria-label={nameOf(table, i)}>
          <div className="pt-card-head">
            <input type="text" className="form-input pt-name" value={table.name} maxLength={L.name} placeholder={`Option ${i + 1}`} aria-label={`Name of option ${i + 1}`} onChange={(e) => setTable(i, { name: e.target.value })} />
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
            {tableLayout(table) === 'rooms' ? (
              <table className="pt-grid pt-rooms">
                <colgroup>
                  <col className="pt-col-roomlabel" />
                  <col className="pt-col-rate" />
                  <col className="pt-col-count" />
                  <col className="pt-col-count" />
                  <col className="pt-col-roomtotal" />
                  <col className="pt-col-remove" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Room</th>
                    <th scope="col">Per room per night</th>
                    <th scope="col">No of nights</th>
                    <th scope="col">No of rooms</th>
                    <th scope="col">Total</th>
                    <th scope="col"><span className="sr-only">Remove the row</span></th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, r) => {
                    const rowName = String(row.label || '').trim() || `row ${r + 1}`;
                    return (
                      <tr key={r}>
                        <th scope="row">
                          <input type="text" className="form-input pt-label" value={row.label} maxLength={L.label} placeholder="e.g. For 2 Adults" aria-label={`Name of row ${r + 1} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { label: e.target.value })} />
                        </th>
                        <td>
                          <input type="number" min={0} step="any" inputMode="decimal" className="form-input pt-num" value={row.rate} aria-label={`Rate per room per night of ${rowName} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { rate: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min={0} max={R.maxNights} step={1} inputMode="numeric" className="form-input pt-num pt-pax" value={row.nights} placeholder={defaults.nights ? String(defaults.nights) : ''} title="Follows the nights of your trip. Type a number to change it for this row." aria-label={`Nights of ${rowName} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { nights: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min={0} max={R.maxRooms} step={1} inputMode="numeric" className="form-input pt-num pt-pax" value={row.rooms} placeholder="1" title="One room unless you type a number." aria-label={`Rooms of ${rowName} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { rooms: e.target.value })} />
                        </td>
                        <td className="pt-calc pt-final" aria-label={`Total of ${rowName} in ${nameOf(table, i)}`}>{cell(roomRowTotal(row, defaults))}</td>
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
                    <th scope="row" colSpan={4} className="pt-grand-label">Grand Total</th>
                    <td className="pt-grand" aria-live="polite">{money(tableTotal(table, quotation))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            ) : (
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
                          <td key={key}>
                            <input type="number" min={0} step="any" inputMode="decimal" className="form-input pt-num" value={row[key]} aria-label={`${title} of ${rowName} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { [key]: e.target.value })} />
                          </td>
                        ))}
                        <td className="pt-calc" aria-label={`Total of ${rowName} in ${nameOf(table, i)}`}>{cell(rowTotal(row))}</td>
                        <td>
                          <input type="number" min={0} max={L.maxPax} step={1} inputMode="numeric" className="form-input pt-num pt-pax" value={row.pax} aria-label={`PAX of ${rowName} in ${nameOf(table, i)}`} onChange={(e) => setRow(i, r, { pax: e.target.value })} />
                        </td>
                        <td className="pt-calc pt-final" aria-label={`Final Price of ${rowName} in ${nameOf(table, i)}`}>{cell(rowFinal(row))}</td>
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
                    <td className="pt-grand" aria-live="polite">{money(tableTotal(table, quotation))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          <button type="button" className="btn btn-outline btn-sm pt-add-row" onClick={() => setTable(i, { rows: [...table.rows, tableLayout(table) === 'rooms' ? blankRoomRow(nextRoomLabel(table)) : blankRow()] })} disabled={table.rows.length >= L.rows}>
            <Plus size={13} /> <span>Add a row</span>
          </button>
        </section>
      ))}
    </div>
  );
};

export default PriceTablesEditor;
