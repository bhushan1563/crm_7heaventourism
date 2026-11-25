import React from 'react';
import { IntroBand, Page, RichLine } from '../PageParts';
import { BannerPagoda } from '../art';
import { mediaUrl } from '../../../services/mediaService';
import { API_ORIGIN } from '../../../services/api';
import { formatLongDate } from '../../../utils/dateHelper';
import { addressLine } from '../../../utils/hotelStay';
import { isDefaultOptionName } from '../../../utils/quotationOptions';
import { RATE_LABELS, hotelTotal, optionTotal, optionUsesRates, rowNights, rowTotal as rateRowTotal, rowUnits } from '../../../utils/hotelRates';
import { OptionPriceTable } from './Pricing';

const crossOrigin = API_ORIGIN ? 'anonymous' : undefined;
const inr = (n) => (Number(n) || 0).toLocaleString('en-IN');
const amenityLine = (amenities) => (amenities || []).join('  •  ');
const timesLine = (h) => [h.checkInTime && `Check-in from ${h.checkInTime}`, h.checkOutTime && `Check-out by ${h.checkOutTime}`].filter(Boolean).join('  •  ');
/** A date and its time as a confirmation prints them: "07 Mar 2026, Time: 14:00", or "Time: ____" to write in when there is none yet. */
const whenText = (date, time) => `${formatLongDate(date)}, Time: ${time || '____'}`;

/** The rates of one hotel as the client's sheet: the room, then an extra bed, a child with a bed, a child with no bed; rows without a rate are left out. */
export const RatesPrint = ({ stay }) => {
  const rows = (stay.rates || []).filter((r) => Number(r.rate) > 0);
  if (!rows.length) return null;
  return (
    <table className="qd-rates">
      <thead>
        <tr><th>Room</th><th>Per room per night (Rs)</th><th>No of nights</th><th>No of rooms</th><th>Total (Rs)</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.kind}>
            <td>{r.label || RATE_LABELS[r.kind]}</td>
            <td>{inr(r.rate)}</td>
            <td>{rowNights(stay, r)}</td>
            <td>{rowUnits(stay, r)}</td>
            <td>{inr(rateRowTotal(stay, r))}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 1 && (
        <tfoot><tr><td colSpan={4} style={{ textAlign: 'right' }}>Hotel total</td><td>{inr(hotelTotal(stay))}</td></tr></tfoot>
      )}
    </table>
  );
};

/** One hotel stay: its photos, name, room, address, the facts of the stay, the amenities, who to call, and its rates. */
export const HotelCard = ({ h, compact = false, confirmed = false, hidePrices = false, keep = true }) => {
  const [cover, ...more] = h.photos || [];
  const stars = h.starRating && h.starRating !== 'Unrated' ? h.starRating : '';
  const facts = [
    h.checkInDate && ['Check In', confirmed ? whenText(h.checkInDate, h.checkInTime) : formatLongDate(h.checkInDate)],
    h.checkOutDate && ['Check Out', confirmed ? whenText(h.checkOutDate, h.checkOutTime) : formatLongDate(h.checkOutDate)],
    h.nights && ['Nights', h.nights],
    h.noOfRooms && ['Rooms', h.noOfRooms],
    h.mealPlan && ['Meal plan', h.mealPlan],
    !confirmed && timesLine(h) && ['Timings', timesLine(h)]
  ].filter(Boolean);
  const contact = [!confirmed && h.contactNumber && `Phone: ${h.contactNumber}`, h.contactPerson && `Contact: ${h.contactPerson}`, h.email && `Email: ${h.email}`].filter(Boolean).join('  |  ');
  const body = (
    <div className="main">
      <div className="top">
        <div>
          <div className="nm">{h.hotelName || 'Hotel'}</div>
          {confirmed && h.bookingNo && <div className="bk"><strong>Hotel Confirmation No:</strong> {h.bookingNo}</div>}
          {h.roomCategory && <div className="rc">{h.roomCategory}</div>}
          {(h.city || h.address) && <div className="ad">📍 {addressLine(h)}</div>}
          {confirmed && h.contactNumber && <div className="ad"><strong>Hotel Contact No:</strong> {h.contactNumber}</div>}
        </div>
        {stars && <span className="star">★ {stars}</span>}
      </div>
      {facts.length > 0 && <div className="facts">{facts.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}</div>}
      {h.amenities?.length > 0 && <div className="line"><b>Amenities:</b> {amenityLine(h.amenities)}</div>}
      {contact && <div className="line">{contact}</div>}
      {!hidePrices && <RatesPrint stay={h} />}
    </div>
  );
  return (
    <div className={`${keep ? 'quotation-keep ' : ''}qd-hotel`}>
      {!compact && cover && <img className="cover" src={mediaUrl(cover.token)} alt={cover.caption || h.hotelName || ''} crossOrigin={crossOrigin} />}
      {!compact && more.length > 0 && (
        <div className="strip" style={{ display: 'flex', gap: 5 }}>
          {more.slice(0, 3).map((p) => <img key={p.token} src={mediaUrl(p.token)} alt={p.caption || ''} crossOrigin={crossOrigin} style={{ flex: 1, minWidth: 0, height: 74, objectFit: 'cover', display: 'block' }} />)}
        </div>
      )}
      <div className="row">
        {compact && cover && <div className="ph"><img src={mediaUrl(cover.token)} alt={cover.caption || h.hotelName || ''} crossOrigin={crossOrigin} /></div>}
        {body}
      </div>
    </div>
  );
};

/**
 * One option of a quotation: a header (OPTION 1, its name, a ribbon when recommended), each of its hotels, and the price at the end. Each hotel
 * is its own block, so a long option may continue on the next page without splitting a table. `priced` leaves the price strip out (the pricing
 * table under the option carries it).
 */
export const OptionBlock = ({ option, number, priced = false, table = null, quotation = null }) => {
  const name = option.name || `Option ${number}`;
  const unnamed = isDefaultOptionName(option.name, number);
  const byTables = optionUsesRates(option);
  const note = option.priceNote && option.priceNote !== 'Per person' ? option.priceNote : '';
  const hotels = option.hotels?.length ? option.hotels : [null];
  return (
    <div className="qd-optwrap" style={{ marginBottom: 14 }}>
      {hotels.map((h, k) => {
        const first = k === 0;
        const last = k === hotels.length - 1;
        return (
          <div key={k} className="quotation-keep">
            {first ? (
              <div className="qd-opt-head">
                {unnamed ? <div className="n">Option {number}</div> : <div><div className="k">OPTION {number}</div><div className="n">{name}</div></div>}
                {option.recommended && <span className="rec">★ RECOMMENDED</span>}
              </div>
            ) : (
              <div className="qd-opt-head" style={{ padding: '4px 16px', background: '#f1ead4', color: '#3b525b', borderBottomWidth: 1 }}><div className="k" style={{ color: '#3b525b' }}>Option {number}{unnamed ? '' : ` · ${name}`}</div></div>
            )}
            <div className={`qd-opt${option.recommended ? ' is-rec' : ''}`}>
              {h ? <HotelCard h={h} compact keep={false} hidePrices={priced ? true : false} /> : <div className="qd-note" style={{ padding: 12, margin: 0, fontStyle: 'italic' }}>Hotels to be confirmed</div>}
              {last && !priced && (
                <>
                  <div className="qd-opt-total">
                    <span className="k">{byTables ? 'Grand Total' : option.pricePerPerson > 0 ? 'Price per person' : 'Price'}</span>
                    <span className="v">{byTables ? `Rs ${inr(optionTotal(option))}` : option.pricePerPerson > 0 ? `Rs ${inr(option.pricePerPerson)}` : 'On request'}</span>
                  </div>
                  {!byTables && option.pricePerPerson > 0 && option.totalPrice > 0 && <div className="sm">Total: Rs {inr(option.totalPrice)}</div>}
                  {note && <div className="sm" style={{ textAlign: 'left' }}><RichLine html={note} /></div>}
                </>
              )}
            </div>
          </div>
        );
      })}
      {table && quotation && <OptionPriceTable table={table} quotation={quotation} />}
    </div>
  );
};

const TITLE = { 'Only Hotel': 'Hotel & Accommodation', 'Events / Corporate': 'Venue & Accommodation' };

/** "Accommodation": the hotels of a single offer, or each hotel option with its price. */
export const StayPage = ({ model, quotation, numeral, id, tables, priced, hidePrices, confirmed }) => {
  const options = quotation.options || [];
  const hotels = quotation.packageDetails?.hotels || [];
  const roomInfo = quotation.packageDetails?.roomInfo;
  return (
    <Page id={id} model={model} header="Accommodation">
      <IntroBand numeral={numeral} title={TITLE[model.type] || 'Accommodation'} text={options.length ? 'Please choose the option that suits you best. All amounts are in Rs.' : 'Where you stay, and the arrangements for each stay.'} art={<BannerPagoda size={52} />} section="stay" />
      {options.length > 0
        ? options.map((option, i) => <OptionBlock key={i} option={option} number={i + 1} priced={priced} table={priced ? tables[i] : null} quotation={quotation} />)
        : hotels.map((h, i) => <HotelCard key={i} h={h} confirmed={confirmed} hidePrices={hidePrices} />)}
      {!options.length && roomInfo && <div className="quotation-keep qd-note"><b style={{ color: '#0a2742' }}>Room Allocation:</b> <RichLine html={roomInfo} /></div>}
    </Page>
  );
};
