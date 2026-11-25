import React from 'react';
import { IntroBand, Page, RichLine } from '../PageParts';
import { BannerVolcano } from '../art';
import { cellText, rowTotal, sheetColumns, tableLayout, tableTotal } from '../../../utils/priceTables';
import { roomDefaults, roomRowNights, roomRowRooms, roomRowTotal } from '../../../utils/roomTables';
import { OPTIONAL_MARK, priceListLines } from '../../../utils/pricingLines';
import { shownPriceNote } from '../../../utils/pricingNote';

const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;
const ROOM_HEADS = ['Room', 'Per room per night', 'No of nights', 'No of rooms', 'Total'];

/** The rows of the per-room-per-night layout, and its Grand Total. `title` puts the option's name above the column titles. */
const RoomsTable = ({ table, quotation, title, index }) => {
  const defaults = roomDefaults(quotation);
  return (
    <table className="qd-ptable">
      <thead>
        {title && <tr><th className="opt" colSpan={5}>{table.name || `Option ${index + 1}`}</th></tr>}
        <tr>{ROOM_HEADS.map((t, c) => <th key={t} className={c === 0 ? 'l' : undefined} style={c === 0 ? { width: '28%' } : undefined}>{t}</th>)}</tr>
      </thead>
      <tbody>
        {(table.rows || []).map((row, r) => {
          const priced = Number(row.rate) > 0; // a row with no rate is left empty, like the sheet
          return (
            <tr key={r}>
              <td className="l">{row.label}</td>
              <td>{cellText(row.rate)}</td>
              <td className="c">{priced ? roomRowNights(row, defaults) : ''}</td>
              <td className="c">{priced ? roomRowRooms(row) : ''}</td>
              <td className="f">{cellText(roomRowTotal(row, defaults))}</td>
            </tr>
          );
        })}
        <tr className="grand"><td colSpan={4}>Grand Total</td><td className="gv">{rs(tableTotal(table, quotation))}</td></tr>
      </tbody>
    </table>
  );
};

/** The sheet layout: Sr No, the amounts (Package and Airfare for a package; Package plus what is typed for a hotel), Total, PAX, Final Price. */
const SheetTable = ({ table, quotation, title, index }) => {
  const sheetCols = sheetColumns(quotation?.quotationType || 'Package', quotation?.priceTables || [table]);
  const colSpan = sheetCols.length + 4; // Sr No + the amounts + Total + PAX + Final Price (every column of the table)
  return (
    <table className="qd-ptable">
      <thead>
        {title && <tr><th className="opt" colSpan={colSpan}>{table.name || `Option ${index + 1}`}</th></tr>}
        <tr>
          {['Sr No', ...sheetCols.map(([, t]) => t), 'Total', 'PAX', 'Final Price'].map((t, c) => (
            <th key={t} className={c === 0 ? 'l' : undefined} style={c === 0 ? { width: '20%' } : undefined}>{t}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(table.rows || []).map((row, r) => {
          const tot = rowTotal(row);
          const final = Math.round(tot * (Number(row.pax) || 0) * 100) / 100;
          return (
            <tr key={r}>
              <td className="l">{row.label}</td>
              {sheetCols.map(([key]) => <td key={key}>{cellText(row[key])}</td>)}
              <td>{cellText(tot)}</td>
              <td className="c">{Number(row.pax) > 0 ? Number(row.pax) : ''}</td>
              <td className="f">{cellText(final)}</td>
            </tr>
          );
        })}
        <tr className="grand"><td colSpan={colSpan - 1}>Grand Total</td><td className="gv">{rs(tableTotal(table, quotation))}</td></tr>
      </tbody>
    </table>
  );
};

/** One option's price table, shown directly under the option's hotels (no "PRICING" banner: the option header names it already). */
export const OptionPriceTable = ({ table, quotation }) => (
  <div className="quotation-keep" style={{ marginTop: 4 }}>
    {tableLayout(table) === 'rooms' ? <RoomsTable table={table} quotation={quotation} /> : <SheetTable table={table} quotation={quotation} />}
  </div>
);

/** The pricing tables of a quotation: each option's name, table and Grand Total. */
export const PriceTables = ({ tables, quotation }) => (
  <div>
    {tables.map((table, i) => (
      <div key={i} className="quotation-keep" style={{ marginBottom: 14 }}>
        {tableLayout(table) === 'rooms' ? <RoomsTable table={table} quotation={quotation} title index={i} /> : <SheetTable table={table} quotation={quotation} title index={i} />}
      </div>
    ))}
  </div>
);

const Line = ({ line }) => (
  <div className="ln">
    <b>• {line.name}:</b>
    <span>Rs {line.cost.toLocaleString('en-IN')} {line.note || 'Per person'}{line.optional && <em style={{ fontWeight: 600, color: '#3b525b' }}> {OPTIONAL_MARK}</em>}</span>
  </div>
);

/** The per-person price list of a quotation without pricing tables, or only what is typed on top of the hotel options. */
export const PriceList = ({ quotation, pricing, hasOptions, type }) => {
  const items = pricing.items?.length ? pricing.items : [];
  if (hasOptions) {
    const extras = priceListLines(pricing, { extrasOnly: true });
    if (!extras.length) return null;
    return (
      <div className="quotation-keep qd-pricelist">
        <h3>Additional Components: -</h3>
        {extras.map((line, i) => <Line key={i} line={line} />)}
      </div>
    );
  }
  return (
    <div className="quotation-keep qd-pricelist">
      <h3>Pricing Breakdown: -</h3>
      {items.length > 0 ? (
        priceListLines(pricing).map((line, i) => <Line key={i} line={line} />)
      ) : (
        <>
          {pricing.packageCostPerPerson > 0 && <div className="ln"><b>Package:</b><span>Rs {pricing.packageCostPerPerson.toLocaleString('en-IN')} {pricing.packageCostNote || `Per person X ${quotation.paxDetails || 'Pax'}`}</span></div>}
          {pricing.airfareCostPerPerson > 0 && <div className="ln"><b>Airfare:</b><span>Rs {pricing.airfareCostPerPerson.toLocaleString('en-IN')} {pricing.airfareCostNote || `Per person X ${quotation.paxDetails || 'Pax'}`}</span></div>}
          {pricing.otherCostPerPerson > 0 && <div className="ln"><b>Other Services:</b><span>Rs {pricing.otherCostPerPerson.toLocaleString('en-IN')} {pricing.otherCostNote || 'Per person'}</span></div>}
        </>
      )}
      <div className="tot">
        <div className="chip"><RichLine html={shownPriceNote(pricing)} /></div>
        {pricing.grandTotal > 0 && <div className="gt">{type === 'Only Hotel' ? 'Grand Total' : 'Total Package'}: Rs {pricing.grandTotal.toLocaleString('en-IN')}</div>}
      </div>
      {pricing.notes && <div className="nt">Note: <RichLine html={pricing.notes} /></div>}
    </div>
  );
};

/** "Pricing": the tables, or the price list. */
export const PricingPage = ({ model, quotation, numeral, id, tables, children }) => (
  <Page id={id} model={model} header="Pricing">
    <IntroBand numeral={numeral} title="Pricing" text="What your journey costs, worked out for your party." art={<BannerVolcano size={52} />} section="pricing" />
    {children}
  </Page>
);
