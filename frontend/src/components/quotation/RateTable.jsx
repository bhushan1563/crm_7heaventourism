import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { RATE_LIMITS, hotelTotal, rowNights, rowTotal, rowUnits } from '../../utils/hotelRates';
import { addRateRow, missingKinds, patchRateRow, removeRateRow, startRates, typedCount, typedRate } from '../../utils/rateTable';
import './rateTable.css';

const plain = (n) => (Number(n) || 0).toLocaleString('en-IN');
const KIND_NAMES = { room: 'room', extraBed: 'extra bed', childWithBed: 'child with bed', childNoBed: 'child with no bed' };
const ADD_LABELS = { extraBed: 'Extra bed', childWithBed: 'Child with bed', childNoBed: 'Child no bed' };

/**
 * The rates of one hotel, in the client's table: the rate per room per night, the nights, the rooms and the total of each row.
 * The first row is the room for 2 adults; an extra bed, a child with a bed and a child with no bed are added only when they are
 * needed. The nights and the rooms start from the stay (shown in grey) and are replaced by what is typed. Every total is counted.
 * `onChange(rates)` gets the whole new list; `where` names the hotel for people using a screen reader, for example "hotel 1, option 2".
 */
export const RateTable = ({ stay, onChange, where }) => {
  const rates = stay.rates || [];
  if (!rates.length) {
    return (
      <div className="rt-empty">
        <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange(startRates())} aria-label={`Add the room rate of ${where}`}>
          <Plus size={13} /> <span>Add the room rate</span>
        </button>
      </div>
    );
  }
  const missing = missingKinds(rates);
  const patch = (kind, values) => onChange(patchRateRow(rates, kind, values));

  return (
    <div className="rt" role="group" aria-label={`Rates of ${where}`}>
      <div className="rt-title">Rates <small>per room per night</small></div>
      <div className="rt-scroll">
        <table className="rt-grid">
          <colgroup>
            <col className="rt-col-label" />
            <col className="rt-col-rate" />
            <col className="rt-col-count" />
            <col className="rt-col-count" />
            <col className="rt-col-total" />
            <col className="rt-col-remove" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Room</th>
              <th scope="col">Per room per night (Rs)</th>
              <th scope="col">No of nights</th>
              <th scope="col">No of rooms</th>
              <th scope="col">Total (Rs)</th>
              <th scope="col"><span className="sr-only">Remove the row</span></th>
            </tr>
          </thead>
          <tbody>
            {rates.map((row) => {
              const total = rowTotal(stay, row);
              return (
                <tr key={row.kind}>
                  <td>
                    <input type="text" className="form-input" value={row.label} maxLength={RATE_LIMITS.label} aria-label={`Name of the ${KIND_NAMES[row.kind]} row, ${where}`} onChange={(e) => patch(row.kind, { label: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" min={0} step="any" className="form-input rt-num" value={row.rate || ''} placeholder="0" aria-label={`Rate per room per night, ${KIND_NAMES[row.kind]}, ${where}`} onChange={(e) => patch(row.kind, { rate: typedRate(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" min={0} step={1} className="form-input rt-num" value={row.nights ?? ''} placeholder={String(rowNights(stay, row))} title="Follows the nights of the stay. Type a number to change it for this row." aria-label={`Nights, ${KIND_NAMES[row.kind]}, ${where}`} onChange={(e) => patch(row.kind, { nights: typedCount(e.target.value, RATE_LIMITS.maxNights) })} />
                  </td>
                  <td>
                    <input type="number" min={0} step={1} className="form-input rt-num" value={row.rooms ?? ''} placeholder={String(rowUnits(stay, row))} title={row.kind === 'room' ? 'Follows the rooms of the stay. Type a number to change it for this row.' : 'One by default. Type a number to change it.'} aria-label={`Rooms, ${KIND_NAMES[row.kind]}, ${where}`} onChange={(e) => patch(row.kind, { rooms: typedCount(e.target.value, RATE_LIMITS.maxUnits) })} />
                  </td>
                  <td className="rt-calc" aria-label={`Total, ${KIND_NAMES[row.kind]}, ${where}`}>{total > 0 ? plain(total) : ''}</td>
                  <td className="rt-remove">
                    {row.kind !== 'room' && (
                      <button type="button" className="btn-icon btn-outline" onClick={() => onChange(removeRateRow(rates, row.kind))} aria-label={`Remove the ${KIND_NAMES[row.kind]} row, ${where}`} title="Take this row out">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4} className="rt-total-label">Hotel total</th>
              <td className="rt-total" aria-live="polite">Rs {plain(hotelTotal(stay))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {missing.length > 0 && (
        <div className="rt-add" aria-label="Rows that can be added">
          <span className="rt-add-hint">Optional:</span>
          {missing.map((kind) => (
            <button key={kind} type="button" className="btn btn-outline btn-sm" onClick={() => onChange(addRateRow(rates, kind))} aria-label={`Add ${KIND_NAMES[kind]} row, ${where}`}>
              <Plus size={13} /> <span>{ADD_LABELS[kind]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RateTable;
