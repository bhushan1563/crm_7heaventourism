import React from 'react';
import { useLocation } from 'react-router-dom';
import { Plane, Check, X, Diamond, Building2, Calendar, MapPin, Phone, Mail, Award, Coffee, Utensils, CreditCard, AlertCircle } from 'lucide-react';
import logoImg from '../assets/logo.webp';
import { formatDate, formatLongDate } from '../utils/dateHelper';
import { richToPlainText, splitDisplayBlocks, toDocumentHtml } from '../utils/richText';
import { shownPriceNote } from '../utils/pricingNote';
import { dayMeta, photoRows } from '../utils/itineraryDoc';
import { addressLine } from '../utils/hotelStay';
import { isDefaultOptionName } from '../utils/quotationOptions';
import { RATE_LABELS, hotelTotal, optionTotal, optionUsesRates, rowNights, rowTotal as rateRowTotal, rowUnits } from '../utils/hotelRates';
import { vehicleTotal } from '../utils/landService';
import { feeAmount, visaFeeTotal } from '../utils/visa';
import { AMOUNT_COLUMNS, cellText, rowFinal, rowTotal, tableHasData, tableLayout, tableTotal, tablesOf } from '../utils/priceTables';
import { roomDefaults, roomRowNights, roomRowRooms, roomRowTotal } from '../utils/roomTables';
import { mediaUrl } from '../services/mediaService';
import { API_ORIGIN } from '../services/api';

// Formatted day text. This document is copied into an isolated print frame for the PDF, which only receives its own
// markup, so the styling travels with it (a <style> inside the document) instead of living in a global stylesheet.
const DAY_TEXT_CSS = `
.qd-rich p { margin: 0 0 3px; }
.qd-rich ul, .qd-rich ol { margin: 0 0 3px; padding-left: 16px; text-align: left; }
.qd-rich li { margin: 1px 0; }
.qd-rich li > p { margin: 0; }
.qd-rich > :last-child { margin-bottom: 0; }
/* One piece of a longer text, laid under the one before it: it keeps the space a paragraph has under it. */
.qd-part > :last-child { margin-bottom: 3px; }
.qd-rich mark { padding: 0 1px; border-radius: 2px; color: #111827; }
.qd-rich [style^="color:"] mark, .qd-rich [style*=";color:"] mark, .qd-rich [style*="; color:"] mark { color: inherit; }
/* One line of a list (an inclusion, a policy, a note): formatted text that runs on like ordinary text. */
.qd-line p { display: inline; margin: 0; }
.qd-line ul, .qd-line ol { margin: 0; }
`;

/** A line of a list on the document. Plain text from older quotations prints exactly as before; formatted text keeps its bold, colour, highlight and size. */
const Line = ({ value }) => <span className="qd-rich qd-line" dangerouslySetInnerHTML={{ __html: toDocumentHtml(value) }} />;

/** The heading of each itinerary day ("Day 02: …"): bold blue text, no highlight. */
const DAY_HEADING_BLUE = '#1d4ed8';

const photoCrossOrigin =API_ORIGIN ? 'anonymous' : undefined;

/** The photos of one day: small rows, each row one height, wide photos on their own row. Scales with the page width. */
const DayPhotos = ({ photos, maxRowHeight = 150 }) => {
  if (!photos?.length) return null;
  const gap = 6;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px`, marginTop: '4px' }}>
      {photoRows(photos, 3).map((row, r) => {
        const aspectSum = row.reduce((sum, { photo }) => sum + photo.width / photo.height, 0);
        return (
          <div key={r} style={{ display: 'flex', gap: `${gap}px`, alignItems: 'flex-start', width: '100%', maxWidth: `${Math.round(maxRowHeight * aspectSum + gap * (row.length - 1))}px` }}>
            {row.map(({ photo }) => (
              <figure key={photo.token} style={{ margin: 0, flex: `${photo.width / photo.height} 1 0`, minWidth: 0 }}>
                <img
                  src={mediaUrl(photo.token)}
                  alt={photo.caption || ''}
                  width={photo.width}
                  height={photo.height}
                  crossOrigin={photoCrossOrigin}
                  style={{ display: 'block', width: '100%', height: 'auto', borderRadius: '3px' }}
                />
                {photo.caption && <figcaption style={{ marginTop: '2px', fontSize: '8px', color: '#000000', fontStyle: 'italic', textAlign: 'center' }}>{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        );
      })}
    </div>
  );
};

const amenityLine = (amenities) => (amenities || []).join('  •  ');
const timesLine = (h) => [h.checkInTime && `Check-in from ${h.checkInTime}`, h.checkOutTime && `Check-out by ${h.checkOutTime}`].filter(Boolean).join('  •  ');

/** A date and its time as a confirmation prints them: "07 Mar 2026, Time: 14:00", or "Time: ____" to write in when there is none yet. */
const whenText = (date, time) => `${formatLongDate(date)}, Time: ${time || '____'}`;

/** Under the destination of a booking confirmation: its number and the day it was confirmed (nothing on a quotation). */
const ConfirmationLine = ({ info, align = 'left' }) =>
  info ? (
    <div style={{ fontSize: '9px', fontWeight: 700, color: info.status === 'Cancelled' ? '#b91c1c' : '#047857', letterSpacing: '0.02em', textTransform: 'none', marginTop: '2px', textAlign: align }}>
      Confirmation Details: {info.no}{info.confirmedAt ? ` • Confirmed on ${formatLongDate(info.confirmedAt)}` : ''}{info.status === 'Cancelled' ? ' • CANCELLED' : ''}
    </div>
  ) : null;

/**
 * One hotel of a HOTEL quotation. A hotel quotation shows more about the hotel than a package does: a large cover photo
 * with a strip of more photos, the address and contact details, the stay, the room and meal plan, the check-in and
 * check-out times and the amenities.
 */
const HotelStayCard = ({ h, confirmed = false, hidePrices = false }) => {
  const [cover, ...more] = h.photos || [];
  const facts = [
    h.checkInDate && ['Check In', confirmed ? whenText(h.checkInDate, h.checkInTime) : formatLongDate(h.checkInDate)],
    h.checkOutDate && ['Check Out', confirmed ? whenText(h.checkOutDate, h.checkOutTime) : formatLongDate(h.checkOutDate)],
    h.nights && ['Nights', h.nights],
    h.noOfRooms && ['Rooms', h.noOfRooms],
    h.mealPlan && ['Meal plan', h.mealPlan],
    !confirmed && timesLine(h) && ['Timings', timesLine(h)] // a confirmation shows the times after the dates instead
  ].filter(Boolean);
  return (
    <div className="quotation-keep" style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {cover && (
        <figure style={{ margin: 0 }}>
          <img src={mediaUrl(cover.token)} alt={cover.caption || h.hotelName || ''} width={cover.width} height={cover.height} crossOrigin={photoCrossOrigin} style={{ display: 'block', width: '100%', height: '175px', objectFit: 'cover' }} />
          {cover.caption && <figcaption style={{ padding: '2px 8px', fontSize: '8px', color: '#000000', fontStyle: 'italic', textAlign: 'center' }}>{cover.caption}</figcaption>}
        </figure>
      )}
      {more.length > 0 && <div style={{ padding: '6px 8px 0' }}><DayPhotos photos={more.slice(0, 3)} maxRowHeight={85} /></div>}
      <div style={{ padding: '9px 12px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>{h.hotelName || 'Hotel'}</div>
            {confirmed && h.bookingNo && <div style={{ fontSize: '10px', color: '#0f172a', marginTop: '1px' }}><strong>Hotel Confirmation No:</strong> {h.bookingNo}</div>}
            {h.roomCategory && <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#0369a1', marginTop: '1px' }}>{h.roomCategory}</div>}
            {(h.city || h.address) && <div style={{ fontSize: '9.5px', color: '#000000', marginTop: '2px' }}>📍 {addressLine(h)}</div>}
            {confirmed && h.contactNumber && <div style={{ fontSize: '9.5px', color: '#000000', marginTop: '1px' }}><strong style={{ color: '#0f172a' }}>Hotel Contact No:</strong> {h.contactNumber}</div>}
          </div>
          {h.starRating && h.starRating !== 'Unrated' && (
            <span style={{ flex: 'none', fontSize: '9px', color: '#b45309', fontWeight: 700, background: '#fef3c7', padding: '2px 7px', borderRadius: '3px' }}>★ {h.starRating}</span>
          )}
        </div>
        {facts.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '4px 12px', marginTop: '7px', paddingTop: '6px', borderTop: '1px solid #e2e8f0', fontSize: '9px', color: '#000000' }}>
            {facts.map(([label, value]) => (
              <div key={label}>
                <strong style={{ color: '#0f172a' }}>{label}:</strong> {value}
              </div>
            ))}
          </div>
        )}
        {h.amenities?.length > 0 && (
          <div style={{ marginTop: '6px', fontSize: '8.5px', color: '#000000' }}>
            <strong style={{ color: '#0f172a' }}>Amenities:</strong> {amenityLine(h.amenities)}
          </div>
        )}
        {((!confirmed && h.contactNumber) || h.email || h.contactPerson) && (
          <div style={{ marginTop: '5px', fontSize: '8.5px', color: '#000000' }}>
            {[!confirmed && h.contactNumber && `Phone: ${h.contactNumber}`, h.contactPerson && `Contact: ${h.contactPerson}`, h.email && `Email: ${h.email}`].filter(Boolean).join('  |  ')}
          </div>
        )}
        {!hidePrices && <RateTablePrint stay={h} />}
      </div>
    </div>
  );
};

const rs =(n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * The PRICING of a hotel or package quotation, laid out like the company's sheets: a box titled PRICING, then for each option its name,
 * a table and the Grand Total.
 * - Only Hotel: Sr No, Package, Total, PAX, Final Price (Airfare / Visa / TCS are not part of a hotel-only quotation).
 * - Package: Room, Per room per night, No of nights, No of rooms, Total (the client's "rooms" sheet).
 * Empty cells stay empty, as on the sheets. Every total is worked out from the figures so they always agree.
 */
const PriceTablesSection = ({ tables, quotation }) => {
  const border = '1px solid #0f172a';
  const head = { border, padding: '3px 6px', fontSize: '9.5px', fontWeight: 800, color: '#0f172a', textAlign: 'left', backgroundColor: '#ffffff' };
  const cell = { border, padding: '3px 6px', fontSize: '9.5px', color: '#0f172a', textAlign: 'right', height: '15px' };
  const defaults = roomDefaults(quotation);
  // Only Hotel shows only the Package amount; Airfare, Visa and TCS are not part of a hotel-only quotation.
  const isHotelOnly = (quotation?.quotationType || '') === 'Only Hotel';
  const sheetCols = isHotelOnly ? AMOUNT_COLUMNS.filter(([key]) => key === 'package') : AMOUNT_COLUMNS;
  const sheetColSpan = 2 + sheetCols.length + 1; // Sr No + amounts + PAX + Final Price → colSpan for Grand Total
  return (
    <div style={{ marginBottom: '14px' }}>
      <div className="quotation-keep" style={{ border: '1.5px solid #0f172a', textAlign: 'center', fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', padding: '4px 0', color: '#0f172a' }}>PRICING</div>
      {tables.map((table, i) => tableLayout(table) === 'rooms' ? (
        <div key={i} className="quotation-keep" style={{ marginTop: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th colSpan={5} style={{ ...head, fontSize: '10.5px', borderBottom: 'none' }}>{table.name || `Option ${i + 1}`}</th>
              </tr>
              <tr>
                {['Room', 'Per room per night', 'No of nights', 'No of rooms', 'Total'].map((title, c) => (
                  <th key={title} style={{ ...head, width: c === 0 ? '28%' : undefined, textAlign: c === 0 ? 'left' : 'center' }}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(table.rows || []).map((row, r) => {
                const priced = Number(row.rate) > 0; // a row with no rate is left empty, like the sheet
                return (
                  <tr key={r}>
                    <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>{row.label}</td>
                    <td style={cell}>{cellText(row.rate)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{priced ? roomRowNights(row, defaults) : ''}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{priced ? roomRowRooms(row) : ''}</td>
                    <td style={{ ...cell, fontWeight: 800 }}>{cellText(roomRowTotal(row, defaults))}</td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={4} style={{ ...cell, fontWeight: 700, padding: '4px 8px' }}>Grand Total</td>
                <td style={{ ...cell, fontWeight: 800, fontSize: '10.5px', backgroundColor: '#fef9c3' }}>{rs(tableTotal(table, quotation))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div key={i} className="quotation-keep" style={{ marginTop: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th colSpan={sheetColSpan} style={{ ...head, fontSize: '10.5px', borderBottom: 'none' }}>{table.name || `Option ${i + 1}`}</th>
              </tr>
              <tr>
                {['Sr No', ...sheetCols.map(([, title]) => title), 'Total', 'PAX', 'Final Price'].map((title, c) => (
                  <th key={title} style={{ ...head, width: c === 0 ? '20%' : undefined, textAlign: c === 0 ? 'left' : 'center' }}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(table.rows || []).map((row, r) => (
                <tr key={r}>
                  <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>{row.label}</td>
                  {sheetCols.map(([key]) => (
                    <td key={key} style={cell}>{cellText(row[key])}</td>
                  ))}
                  {(() => {
                    // For Only Hotel: Total = Package only; Final Price = Package × PAX (Airfare/Visa/TCS excluded)
                    const tot = isHotelOnly ? (Number(row.package) || 0) : rowTotal(row);
                    const final = Math.round(tot * (Number(row.pax) || 0) * 100) / 100;
                    return (<>
                      <td style={cell}>{cellText(tot)}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{Number(row.pax) > 0 ? Number(row.pax) : ''}</td>
                      <td style={{ ...cell, fontWeight: 800 }}>{cellText(final)}</td>
                    </>);
                  })()}
                </tr>
              ))}
              <tr>
                <td colSpan={sheetColSpan - 1} style={{ ...cell, borderRight: border, fontWeight: 700, padding: '4px 8px' }}>Grand Total</td>
                <td style={{ ...cell, fontWeight: 800, fontSize: '10.5px', backgroundColor: '#fef9c3' }}>
                  {rs(isHotelOnly
                    ? Math.round((table.rows || []).reduce((sum, r) => sum + Math.round((Number(r.package) || 0) * (Number(r.pax) || 0) * 100) / 100, 0) * 100) / 100
                    : tableTotal(table, quotation))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

/**
 * One option's price table shown directly below the option's hotel block, so hotel + price appear together.
 * No "PRICING" banner — the option header names the option already.
 */
const OptionPriceTable = ({ table, quotation }) => {
  const border = '1px solid #0f172a';
  const head = { border, padding: '3px 6px', fontSize: '9.5px', fontWeight: 800, color: '#0f172a', textAlign: 'left', backgroundColor: '#ffffff' };
  const cell = { border, padding: '3px 6px', fontSize: '9.5px', color: '#0f172a', textAlign: 'right', height: '15px' };
  const defaults = roomDefaults(quotation);
  const isHotelOnly = (quotation?.quotationType || '') === 'Only Hotel';
  const sheetCols = isHotelOnly ? AMOUNT_COLUMNS.filter(([key]) => key === 'package') : AMOUNT_COLUMNS;
  const sheetColSpan = 2 + sheetCols.length + 1;

  if (tableLayout(table) === 'rooms') {
    return (
      <div className="quotation-keep" style={{ marginTop: '3px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {['Room', 'Per room per night', 'No of nights', 'No of rooms', 'Total'].map((title, c) => (
                <th key={title} style={{ ...head, width: c === 0 ? '28%' : undefined, textAlign: c === 0 ? 'left' : 'center' }}>{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(table.rows || []).map((row, r) => {
              const rateEntered = Number(row.rate) > 0;
              return (
                <tr key={r}>
                  <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>{row.label}</td>
                  <td style={cell}>{cellText(row.rate)}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{rateEntered ? roomRowNights(row, defaults) : ''}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{rateEntered ? roomRowRooms(row) : ''}</td>
                  <td style={{ ...cell, fontWeight: 800 }}>{cellText(roomRowTotal(row, defaults))}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={4} style={{ ...cell, fontWeight: 700, padding: '4px 8px' }}>Grand Total</td>
              <td style={{ ...cell, fontWeight: 800, fontSize: '10.5px', backgroundColor: '#fef9c3' }}>{rs(tableTotal(table, quotation))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // 'sheet' layout (Only Hotel and Package)
  return (
    <div className="quotation-keep" style={{ marginTop: '3px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {['Sr No', ...sheetCols.map(([, title]) => title), 'Total', 'PAX', 'Final Price'].map((title, c) => (
              <th key={title} style={{ ...head, width: c === 0 ? '20%' : undefined, textAlign: c === 0 ? 'left' : 'center' }}>{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(table.rows || []).map((row, r) => (
            <tr key={r}>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>{row.label}</td>
              {sheetCols.map(([key]) => (
                <td key={key} style={cell}>{cellText(row[key])}</td>
              ))}
              {(() => {
                const tot = isHotelOnly ? (Number(row.package) || 0) : rowTotal(row);
                const final = Math.round(tot * (Number(row.pax) || 0) * 100) / 100;
                return (<>
                  <td style={cell}>{cellText(tot)}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{Number(row.pax) > 0 ? Number(row.pax) : ''}</td>
                  <td style={{ ...cell, fontWeight: 800 }}>{cellText(final)}</td>
                </>);
              })()}
            </tr>
          ))}
          <tr>
            <td colSpan={sheetColSpan - 1} style={{ ...cell, borderRight: border, fontWeight: 700, padding: '4px 8px' }}>Grand Total</td>
            <td style={{ ...cell, fontWeight: 800, fontSize: '10.5px', backgroundColor: '#fef9c3' }}>
              {rs(isHotelOnly
                ? Math.round((table.rows || []).reduce((sum, r) => sum + Math.round((Number(r.package) || 0) * (Number(r.pax) || 0) * 100) / 100, 0) * 100) / 100
                : tableTotal(table, quotation))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

/**
 * The body of a VISA quotation: the visa itself, the documents the applicants must bring (a checklist), the fees (per applicant or
 * for the whole group) with their total, and what the service includes. The price of the quotation is the fee table.
 */
const VisaSection = ({ visa, fees, documents, inclusions, trip = {}, hidePrices = false }) => {
  const applicants = Math.max(1, Number(visa.applicants) || 1);
  const total = visaFeeTotal(fees, applicants);
  const columns = '3fr 1.7fr 1.1fr 1.2fr';
  // Who the visa is for and when: what was typed on the first tab (client, guests, travel date, duration) and how long the offer holds.
  const tripFacts = [
    ['Client', trip.client],
    ['Travellers', trip.pax],
    ['Travel date', trip.travelDate ? formatDate(trip.travelDate) : ''],
    ['Duration', trip.duration],
    ['Quotation valid until', trip.validUntil ? formatDate(trip.validUntil) : '']
  ].filter(([, v]) => v);
  const facts = [
    ['Country', visa.country],
    ['Visa type', visa.visaType],
    ['Entry', visa.entryType],
    ['Issued as', visa.mode],
    ['Processing time', visa.processingTime],
    ['Validity', visa.validity],
    ['Length of stay', visa.stay],
    ['Applicants', String(applicants)]
  ].filter(([, v]) => v);
  const cell = { padding: '4px 6px', fontSize: '9.5px', color: '#000000' };
  const checklist = (title, items, tick) => (
    <div style={{ marginBottom: '10px' }}>
      <div className="quotation-keep" style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', paddingLeft: '2px' }}>
        {items.map((item, i) => (
          <div key={i} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '9.5px', color: '#000000' }}>
            <span style={{ color: '#059669', fontWeight: 800, flexShrink: 0 }}>{tick}</span>
            <Line value={item} />
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      {tripFacts.length > 0 && (
        <div className="quotation-keep" data-testid="visa-trip-details" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3px 14px', marginBottom: '10px', padding: '6px 9px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '9.5px', color: '#000000' }}>
          {tripFacts.map(([label, value]) => (
            <div key={label}>
              <strong style={{ color: '#0f172a' }}>{label}:</strong> {value}
            </div>
          ))}
        </div>
      )}

      {facts.length > 0 && (
        <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3px 14px', marginBottom: '10px', padding: '6px 9px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '9.5px', color: '#000000' }}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <strong style={{ color: '#0f172a' }}>{label}:</strong> {value}
            </div>
          ))}
        </div>
      )}

      {documents.length > 0 && checklist('Documents Required', documents, '✓')}

      {!hidePrices && fees.length > 0 && (
        <div className="quotation-keep" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: columns, backgroundColor: '#0f172a', color: '#ffffff', fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {['Fee', 'Charged', 'Rate', 'Amount'].map((h, i) => (
              <div key={h} style={{ padding: '5px 6px', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {fees.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: columns, borderTop: '1px solid #e2e8f0', backgroundColor: i % 2 ? '#f8fafc' : '#ffffff', alignItems: 'start' }}>
              <div style={{ ...cell, fontWeight: 700, color: '#0f172a' }}>{f.label || 'Fee'}</div>
              <div style={cell}>{f.per === 'group' ? 'Whole group' : `Per applicant × ${applicants}`}</div>
              <div style={{ ...cell, textAlign: 'right' }}>{rs(f.amount)}</div>
              <div style={{ ...cell, textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{rs(feeAmount(f, applicants))}</div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '5.8fr 1.2fr', borderTop: '2px solid #0f172a', backgroundColor: '#fef9c3' }}>
            <div style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800, color: '#0f172a' }}>Total for {applicants} applicant{applicants === 1 ? '' : 's'}</div>
            <div style={{ padding: '6px 6px', fontSize: '11.5px', fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{total > 0 ? rs(total) : 'On request'}</div>
          </div>
        </div>
      )}
      {!hidePrices && visa.priceNote && <div className="quotation-keep" style={{ fontSize: '9px', color: '#000000', fontStyle: 'italic', marginBottom: '10px' }}>Note: <Line value={visa.priceNote} /></div>}

      {inclusions.length > 0 && checklist('Visa Inclusions', inclusions, '✓')}
    </div>
  );
};

/**
 * The vehicle part of a LAND SERVICE quotation (vehicle only): the trip, a table of vehicles with their rates and amounts,
 * the total, and what the vehicle includes. The price of the quotation is this table.
 */
const LandServiceSection = ({ vehicles, trip, inclusions, hidePrices = false }) => {
  const total = vehicleTotal(vehicles);
  const columns = hidePrices ? '2.7fr 0.7fr 0.85fr 0.6fr' : '2.7fr 0.7fr 0.85fr 0.6fr 1.15fr 1.25fr';
  const heads = hidePrices ? ['Vehicle', 'Seats', 'AC', 'Qty'] : ['Vehicle', 'Seats', 'AC', 'Qty', 'Rate / vehicle', 'Amount'];
  const facts = [['Route', trip.route], ['Pick-up', trip.pickupPoint], ['Drop', trip.dropPoint], ['Kilometres', trip.kmPolicy]].filter(([, v]) => v);
  const cell = { padding: '4px 6px', fontSize: '9.5px', color: '#000000' };
  return (
    <div>
      {facts.length > 0 && (
        <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3px 14px', marginBottom: '8px', padding: '6px 9px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '9.5px', color: '#000000' }}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <strong style={{ color: '#0f172a' }}>{label}:</strong> {value}
            </div>
          ))}
        </div>
      )}

      {vehicles.length > 0 && (
        <div className="quotation-keep" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: columns, backgroundColor: '#0f172a', color: '#ffffff', fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {heads.map((h, i) => (
              <div key={h} style={{ padding: '5px 6px', textAlign: i >= 4 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {vehicles.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: columns, borderTop: '1px solid #e2e8f0', backgroundColor: i % 2 ? '#f8fafc' : '#ffffff', alignItems: 'start' }}>
              <div style={{ ...cell, fontWeight: 700, color: '#0f172a' }}>
                {v.vehicleType || 'Vehicle'}
                {v.notes && <div style={{ fontWeight: 400, fontSize: '8.5px', color: '#000000' }}><Line value={v.notes} /></div>}
              </div>
              <div style={cell}>{v.seats > 0 ? v.seats : '–'}</div>
              <div style={cell}>{v.acType || '–'}</div>
              <div style={cell}>{v.quantity}</div>
              {!hidePrices && <div style={{ ...cell, textAlign: 'right' }}>{rs(v.rate)}</div>}
              {!hidePrices && <div style={{ ...cell, textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{rs((Number(v.quantity) || 0) * (Number(v.rate) || 0))}</div>}
            </div>
          ))}
          {!hidePrices && (
            <div style={{ display: 'grid', gridTemplateColumns: '5.6fr 1.25fr', borderTop: '2px solid #0f172a', backgroundColor: '#fef9c3' }}>
              <div style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800, color: '#0f172a' }}>Total for the trip</div>
              <div style={{ padding: '6px 6px', fontSize: '11.5px', fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{total > 0 ? rs(total) : 'On request'}</div>
            </div>
          )}
        </div>
      )}
      {!hidePrices && trip.priceNote &&<div className="quotation-keep" style={{ fontSize: '9px', color: '#000000', fontStyle: 'italic', marginBottom: '10px' }}>Note: <Line value={trip.priceNote} /></div>}

      {inclusions.length > 0 && (
        <div>
          <div className="quotation-keep" style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>Vehicle Inclusions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', paddingLeft: '2px' }}>
            {inclusions.map((inc, i) => (
              <div key={i} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '9.5px', color: '#000000' }}>
                <span style={{ color: '#059669', fontWeight: 800, flexShrink: 0 }}>✓</span>
                <Line value={inc} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const inr = (n) => (Number(n) || 0).toLocaleString('en-IN');

/**
 * The rates of one hotel, as the client's sheet: the room, then (only when they were added) an extra bed, a child with a bed and a
 * child with no bed; for each the rate per room per night, the nights, the rooms and the total. A row with no rate is left out.
 */
const RateTablePrint = ({ stay }) => {
  const rows = (stay.rates || []).filter((r) => Number(r.rate) > 0);
  if (!rows.length) return null;
  const cell = { border: '1px solid #cbd5e1', padding: '3px 6px', fontSize: '9.5px', color: '#0f172a' };
  const head = { ...cell, background: '#f1f5f9', fontWeight: 800, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#000000' };
  const num = { textAlign: 'right', whiteSpace: 'nowrap' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '7px' }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>Room</th>
          <th style={{ ...head, ...num }}>Per room per night (Rs)</th>
          <th style={{ ...head, ...num }}>No of nights</th>
          <th style={{ ...head, ...num }}>No of rooms</th>
          <th style={{ ...head, ...num }}>Total (Rs)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.kind}>
            <td style={{ ...cell, fontWeight: 700 }}>{r.label || RATE_LABELS[r.kind]}</td>
            <td style={{ ...cell, ...num }}>{inr(r.rate)}</td>
            <td style={{ ...cell, ...num }}>{rowNights(stay, r)}</td>
            <td style={{ ...cell, ...num }}>{rowUnits(stay, r)}</td>
            <td style={{ ...cell, ...num, fontWeight: 700 }}>{inr(rateRowTotal(stay, r))}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr>
            <td colSpan={4} style={{ ...cell, textAlign: 'right', fontWeight: 800, background: '#f8fafc' }}>Hotel total</td>
            <td style={{ ...cell, ...num, fontWeight: 800, background: '#f8fafc' }}>{inr(hotelTotal(stay))}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
};

/** What one hotel of an option shows: its photo, its name, room category and address, its dates, and its rate table. */
const HotelProposalBody = ({ h, priced = false }) => {
  const cover = h.photos?.[0];
  return (
    <div style={{ padding: '8px 10px 9px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        {cover && <img src={mediaUrl(cover.token)} alt={cover.caption || h.hotelName || ''} width={cover.width} height={cover.height} crossOrigin={photoCrossOrigin} style={{ flex: 'none', display: 'block', width: '112px', height: '76px', objectFit: 'cover', borderRadius: '5px' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>{h.hotelName || 'Hotel'}</span>
            {h.starRating && h.starRating !== 'Unrated' && <span style={{ fontSize: '8.5px', color: '#b45309', fontWeight: 700, background: '#fef3c7', padding: '1px 6px', borderRadius: '3px' }}>★ {h.starRating}</span>}
          </div>
          {h.roomCategory && <div style={{ fontSize: '10px', fontWeight: 700, color: '#0369a1', marginTop: '1px' }}>{h.roomCategory}</div>}
          {(h.address || h.city) && <div style={{ fontSize: '9px', color: '#000000', marginTop: '2px' }}>📍 {addressLine(h)}</div>}
          {(h.checkInDate || h.checkOutDate) && (
            <div style={{ fontSize: '9px', color: '#0f172a', marginTop: '3px' }}>
              {h.checkInDate && <span><strong>Check In:</strong> {formatLongDate(h.checkInDate)}</span>}
              {h.checkInDate && h.checkOutDate && '   •   '}
              {h.checkOutDate && <span><strong>Check Out:</strong> {formatLongDate(h.checkOutDate)}</span>}
            </div>
          )}
          <div style={{ fontSize: '8.5px', color: '#000000', marginTop: '2px' }}>{[h.nights, h.noOfRooms, h.mealPlan].filter(Boolean).join('   •   ')}</div>
          {h.amenities?.length > 0 && <div style={{ fontSize: '8px', color: '#000000', marginTop: '2px' }}>{amenityLine(h.amenities.slice(0, 5))}</div>}
        </div>
      </div>
      {!priced && <RateTablePrint stay={h} />}
    </div>
  );
};

/**
 * One option of a HOTEL quotation, laid out as a proposal: a header band (OPTION 1, its name, a ribbon when it is recommended), each
 * of its hotels with its room, address, dates and rate table, and the Grand Total of the option at the end. Each hotel is its own
 * block, so a long option can continue on the next page without splitting a table (the blocks are never nested).
 */
const OptionProposal = ({ option, number, priced = false }) => {
  const name = option.name || `Option ${number}`;
  const unnamed = isDefaultOptionName(option.name, number);
  const byTables = optionUsesRates(option);
  const note = option.priceNote && option.priceNote !== 'Per person' ? option.priceNote : '';
  const blocks = option.hotels.length ? option.hotels : [null];
  const border = option.recommended ? '#f59e0b' : '#cbd5e1';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {blocks.map((h, k) => {
        const first = k === 0;
        const last = k === blocks.length - 1;
        return (
          <div key={k} className="quotation-keep" style={{ border: `${option.recommended ? 2 : 1}px solid ${border}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            {first ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: '#0f172a', color: '#ffffff', padding: '6px 10px' }}>
                {unnamed ? (
                  <div style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1.2 }}>Option {number}</div>
                ) : (
                  <div>
                    <span style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.14em', color: '#7dd3fc' }}>OPTION {number}</span>
                    <div style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1.2 }}>{name}</div>
                  </div>
                )}
                {option.recommended && <span style={{ background: '#f59e0b', color: '#ffffff', fontSize: '8px', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 8px', borderRadius: '3px' }}>★ RECOMMENDED</span>}
              </div>
            ) : (
              <div style={{ background: '#f1f5f9', color: '#000000', fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', padding: '3px 10px', textTransform: 'uppercase' }}>Option {number}{unnamed ? '' : ` · ${name}`}</div>
            )}
            {h ? <HotelProposalBody h={h} priced={priced} /> : <div style={{ padding: '10px', fontSize: '9px', color: '#000000', fontStyle: 'italic' }}>Hotels to be confirmed</div>}
            {last && !priced && (
              <div style={{ background: '#e0f2fe', borderTop: '1px solid #bae6fd', padding: '7px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#0c4a6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{byTables ? 'Grand Total' : option.pricePerPerson > 0 ? 'Price per person' : 'Price'}</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#0c4a6e' }}>{byTables ? `Rs ${inr(optionTotal(option))}` : option.pricePerPerson > 0 ? `Rs ${inr(option.pricePerPerson)}` : 'On request'}</span>
                </div>
                {!byTables && option.pricePerPerson > 0 && option.totalPrice > 0 && <div style={{ fontSize: '9px', color: '#0c4a6e', fontWeight: 700, textAlign: 'right' }}>Total: Rs {inr(option.totalPrice)}</div>}
                {note && <div style={{ fontSize: '8.5px', color: '#0c4a6e', marginTop: '2px' }}><Line value={note} /></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** The options of a hotel (or package) quotation, one after the other. When `tables` are provided each option
 *  shows its price table directly below its hotel block so hotel and price are always on the same page. */
const HotelOptionsProposal = ({ options, priced = false, tables = [], quotation = null }) => (
  <div style={{ marginBottom: '10px' }}>
    <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
      <Building2 size={13} style={{ color: '#0284c7' }} />
      <span>Hotel Options</span>
    </div>
    <div style={{ fontSize: '8.5px', color: '#000000', marginBottom: '8px' }}>{priced ? 'Please choose the option that suits you best. The price of each option is shown below it. All amounts are in Rs.' : 'Please choose the option that suits you best. All amounts are in Rs.'}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {options.map((option, i) => {
        const table = tables[i];
        return (
          <div key={i}>
            <OptionProposal option={option} number={i + 1} priced={priced} />
            {table && quotation && <OptionPriceTable table={table} quotation={quotation} />}
          </div>
        );
      })}
    </div>
  </div>
);

/**
 * Hotel options side by side: one card per option with its hotels and its price per person. The cheapest price is not
 * singled out (the guest compares); an option the sales person recommends carries a ribbon.
 */
const OptionsComparison = ({ options, paxDetails, priced = false }) => {
  const columns = Math.min(options.length, 3);
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Building2 size={13} style={{ color: '#0284c7' }} />
        <span>Hotel Options</span>
      </div>
      <div style={{ fontSize: '8.5px', color: '#000000', marginBottom: '6px' }}>Please choose the option that suits you best.{priced ? ' The price of each option is in the pricing table below.' : paxDetails ? ` Prices are for ${paxDetails}.` : ''}</div>
      <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '8px', alignItems: 'stretch' }}>
        {options.map((option, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', border: option.recommended ? '2px solid #f59e0b' : '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            {option.recommended && <div style={{ background: '#f59e0b', color: '#ffffff', fontSize: '8px', fontWeight: 800, letterSpacing: '0.1em', textAlign: 'center', padding: '2px 0' }}>★ RECOMMENDED</div>}
            <div style={{ background: '#0f172a', color: '#ffffff', fontSize: '10.5px', fontWeight: 800, padding: '5px 8px' }}>{option.name || `Option ${i + 1}`}</div>
            {!priced && (
              <div style={{ padding: '7px 8px 6px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0369a1', lineHeight: 1.1 }}>{option.pricePerPerson > 0 ? rs(option.pricePerPerson) : 'On request'}</div>
                <div style={{ fontSize: '8px', color: '#000000', marginTop: '1px' }}><Line value={option.priceNote || 'Per person'} /></div>
                {option.pricePerPerson > 0 && option.totalPrice > 0 && <div style={{ fontSize: '8.5px', color: '#0f172a', fontWeight: 700, marginTop: '3px' }}>Total: {rs(option.totalPrice)}</div>}
              </div>
            )}
            <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 }}>
              {option.hotels.map((h, k) => (
                <div key={k}>
                  {h.photos?.[0] && <img src={mediaUrl(h.photos[0].token)} alt={h.hotelName || ''} width={h.photos[0].width} height={h.photos[0].height} crossOrigin={photoCrossOrigin} style={{ display: 'block', width: '100%', height: '62px', objectFit: 'cover', borderRadius: '4px', marginBottom: '3px' }} />}
                  <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                    {h.hotelName || 'Hotel'}
                    {h.starRating && h.starRating !== 'Unrated' && <span style={{ marginLeft: '4px', fontSize: '8px', color: '#b45309', fontWeight: 700 }}>★ {h.starRating}</span>}
                  </div>
                  {h.roomCategory && <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0369a1' }}>{h.roomCategory}</div>}
                  {(h.address || h.city) && <div style={{ fontSize: '8px', color: '#000000' }}>📍 {addressLine(h)}</div>}
                  {(h.checkInDate || h.checkOutDate) && (
                    <div style={{ fontSize: '8px', color: '#0f172a', marginTop: '1px' }}>
                      {h.checkInDate && <span><strong>Check In:</strong> {formatLongDate(h.checkInDate)}</span>}
                      {h.checkInDate && h.checkOutDate && '  •  '}
                      {h.checkOutDate && <span><strong>Check Out:</strong> {formatLongDate(h.checkOutDate)}</span>}
                    </div>
                  )}
                  <div style={{ fontSize: '8px', color: '#000000', marginTop: '1px' }}>{[h.nights, h.mealPlan, h.noOfRooms].filter(Boolean).join('  •  ')}</div>
                  {h.amenities?.length > 0 && <div style={{ fontSize: '7.5px', color: '#000000', marginTop: '1px' }}>{amenityLine(h.amenities.slice(0, 4))}</div>}
                </div>
              ))}
              {option.hotels.length === 0 && <div style={{ fontSize: '8.5px', color: '#000000', fontStyle: 'italic' }}>Hotels to be confirmed</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// `before` puts extra pages ahead of the quotation (a booking confirmation adds its booking page). It is a function that receives
// the header, footer and page style of this document, so the extra pages look exactly like the rest.
export const QuotationDocumentView = ({ quotation, pageNumber = null, id = 'quotation-doc', before = null }) => {
  const { pathname } = useLocation();
  const isBuilderPage = /^\/quotations\/(?:new|[^/]+\/edit)$/.test(pathname);
  const pageWidth = isBuilderPage ? '120mm' : '210mm';

  if (!quotation) return null;

  const quotationType = quotation.quotationType || 'Package';

  const company = quotation.companyDetails || {
    name: '7Heaven Tourism',
    tagline: 'Travel with Trust',
    description: 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings',
    address: '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara',
    phone: '+91 7862829178',
    email: 'sales@7heaventourism.in',
    website: 'www.7heaventourism.in'
  };

  const itinerary = quotation.itinerary || [];
  const packageDetails = quotation.packageDetails || { hotels: [], roomInfo: '', inclusions: [] };
  const pricing = quotation.pricing || {};
  const flightDetails = quotation.flightDetails || [];
  const exclusions = quotation.exclusions || [];
  const paymentPolicy = quotation.paymentPolicy || [];
  const cancellationPolicy = quotation.cancellationPolicy || [];
  // A booking confirmation carries `confirmationInfo`: it says so under the destination, shows what each hotel gave, and leaves the vehicle notes out.
  const confirmationInfo = quotation.confirmationInfo || null;
  const isConfirmation = Boolean(confirmationInfo);
  // A booking confirmation does not print prices unless the booking says so (the "Show prices on the voucher" switch).
  const hidePrices = isConfirmation && !confirmationInfo.showPricing;
  // A visa has no vehicle, and a hotel quotation (Only Hotel) does not carry vehicle notes either; packages and the other kinds keep them.
  const vehicleNotes = quotationType === 'Visa' || quotationType === 'Only Hotel' || isConfirmation ? [] : quotation.vehicleNotes || [];
  const importantNotes = quotation.importantNotes || [];

  // Header Component
  const DocumentHeader = () => (
    <div style={{ borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        {/* Left: Brand Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src={company.logo || logoImg}
            alt={company.name || '7HEAVEN TOURISM'}
            style={{
              width: '56px',
              height: '56px',
              objectFit: 'contain',
              borderRadius: '50%',
              border: '2px solid rgba(2, 132, 199, 0.25)',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
              flexShrink: 0
            }}
          />

          <div>
            <h1
              style={{
                fontSize: '26px',
                fontWeight: 900,
                color: '#0f172a',
                letterSpacing: '0.04em',
                lineHeight: 1.1,
                fontFamily: "var(--font-headline)",
                margin: 0
              }}
            >
              {company.name || '7 HEAVEN TOURISM'}
            </h1>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#0284c7',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginTop: '2px'
              }}
            >
              {company.tagline || 'Travel with Trust'}
            </div>
          </div>
        </div>

        {/* Right: Quotation Ref No, Type & Date */}
        <div style={{ textAlign: 'right', fontSize: '11px', color: '#000000' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '12px' }}>
            Ref: {quotation.quotationNo || '7H-QT-2026'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', marginTop: '2px' }}>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '3px',
                backgroundColor: quotationType === 'Only Hotel' ? '#ecfdf5' : (quotationType === 'Events / Corporate' ? '#fdf4ff' : '#f0f9ff'),
                color: quotationType === 'Only Hotel' ? '#047857' : (quotationType === 'Events / Corporate' ? '#a21caf' : '#0369a1'),
                border: '1px solid currentColor'
              }}
            >
              {quotationType}
            </span>
            <span>Date: {quotation.travelDate ? formatDate(quotation.travelDate) : 'September 2026'}</span>
          </div>
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: '10px',
          textAlign: 'center',
          fontSize: '11px',
          fontWeight: 800,
          color: '#b91c1c',
          letterSpacing: '0.04em',
          padding: '4px 8px',
          background: '#fff1f2',
          borderRadius: '4px',
          border: '1px solid #ffe4e6'
        }}
      >
        ★ {company.description || 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings'} ★
      </div>
    </div>
  );

  // Footer Component - One line address and updated contacts
  const DocumentFooter = () => (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: '10px',
        borderTop: '1.5px solid #e2e8f0',
        textAlign: 'center',
        fontSize: '9.5px',
        color: '#000000',
        lineHeight: 1.4
      }}
    >
      <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Add: {company.address || '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara'}
      </div>
      <div style={{ marginTop: '2px', fontWeight: 600 }}>
        Mob: <span style={{ color: '#0f172a' }}>{company.phone || '+91 7862829178'}</span> | Mail:{' '}
        <a href={`mailto:${company.email || 'sales@7heaventourism.in'}`} style={{ color: '#0369a1', textDecoration: 'none', fontWeight: 700 }}>
          {company.email || 'sales@7heaventourism.in'}
        </a> | website:{' '}
        <a
          href={`https://${(company.website || 'www.7heaventourism.in').replace(/^https?:\/\//, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0369a1', textDecoration: 'none', fontWeight: 700 }}
        >
          *{company.website || 'www.7heaventourism.in'}
        </a>
      </div>
    </div>
  );

  const pageContainerStyle = {
    width: pageWidth,
    maxWidth: pageWidth,
    minHeight: '297mm',
    height: 'auto',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    padding: '5mm 5mm',
    boxSizing: 'border-box',
    border: '2px solid #0f172a',
    borderRadius: '4px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    fontFamily: "'Plus Jakarta Sans', -apple-system, Roboto, Arial, sans-serif",
    position: 'relative',
    overflow: 'visible'
  };

  const hasHotels = packageDetails.hotels && packageDetails.hotels.length > 0;
  // Several hotel options with their own prices replace the single list of hotels and the single price block.
  const options = quotation.options || [];
  const hasOptions = options.length > 0;
  // A land service is vehicle only: the vehicle table is its price, and there are no hotels.
  const isLand = quotationType === 'Land Service';
  const vehicles = quotation.vehicles || [];
  const vehicleInclusions = quotation.vehicleInclusions || [];
  // A visa has no itinerary or hotels: its documents checklist and fees are the whole body, and the fee table is its price.
  const isVisaQuotation = quotationType === 'Visa';
  const visa = quotation.visa || {};
  const visaFees = quotation.visaFees || [];
  const visaDocuments = quotation.visaDocuments || [];
  const visaInclusions = quotation.visaInclusions || [];
  const hasInclusions = packageDetails.inclusions && packageDetails.inclusions.length > 0;
  const hasPackageSection = isVisaQuotation
    ? true // a visa quotation always shows the visa; an empty one still says which country and who it is for
    : isLand ? vehicles.length > 0 || vehicleInclusions.length > 0 : hasHotels || hasOptions || packageDetails.roomInfo || hasInclusions;
  const hasItinerary = itinerary && itinerary.length > 0;

  // Pricing check
  const pricingItems = pricing.items && pricing.items.length > 0 ? pricing.items : [];
  const hasPricingSection = !hidePrices && Boolean(
    pricingItems.length > 0 ||
    pricing.packageCostPerPerson > 0 ||
    pricing.airfareCostPerPerson > 0 ||
    pricing.otherCostPerPerson > 0 ||
    pricing.totalCostPerPerson > 0 ||
    pricing.grandTotal > 0 ||
    pricing.totalCostNote);

  // A hotel quotation (the sheet) or a package (per room per night) priced with the pricing tables prints them (only the options with
  // something entered, and only those laid out for this kind of quotation) instead of the price list.
  const priceTables = hidePrices ? [] : tablesOf(quotation).filter(tableHasData);
  const hasPriceTables = priceTables.length > 0;
  const hasFlightSection = !isVisaQuotation && (quotation.asPerFlightTicket || (flightDetails && flightDetails.length > 0));
  const hasExclusions = exclusions && exclusions.length > 0;
  const hasPaymentPolicy = paymentPolicy && paymentPolicy.length > 0;
  const hasCancellationPolicy = cancellationPolicy && cancellationPolicy.length > 0;
  const hasVehicleNotes = vehicleNotes && vehicleNotes.length > 0;
  const hasImportantNotes = importantNotes && importantNotes.length > 0;

  // Section Header Title based on Quotation Type
  const getPackageSectionTitle = () => {
    switch (quotationType) {
      case 'Only Hotel':
        return 'Hotel & Accommodation Details: -';
      case 'Events / Corporate':
        return 'Venue, Hotel & Inclusions: -';
      case 'Land Service':
        return 'Vehicle & Rates: -';
      case 'Visa':
        return 'Visa Details, Documents & Fees: -';
      default:
        return 'Package Details: -';
    }
  };

  // The terms, policies and exclusions page is for hotel, package, land and event quotations. The client does not want it on a visa
  // quotation (it has its own checklist, fees and inclusions), so a visa never prints it.
  const showBackPages = (!pageNumber || pageNumber === 3) && !isVisaQuotation;
  const hasPoliciesPage = hasPaymentPolicy || hasCancellationPolicy;
  const hasExclusionsPage = hasExclusions || hasVehicleNotes;

  const SectionBanner = ({ title, accent }) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1.5px solid ${accent}`,
        paddingBottom: '4px',
        marginBottom: '10px'
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </div>
      <div style={{ fontSize: '10px', color: '#000000', fontWeight: 600 }}>
        Ref: <strong style={{ color: '#0f172a' }}>{quotation.quotationNo || '7H-QT-2026'}</strong>
      </div>
    </div>
  );

  const PricingSection = () => {
    // When options are shown each carries its own inline price table; don't render a separate PRICING section.
    if (hasPriceTables && hasOptions) return null;
    if (hasPriceTables) return <PriceTablesSection tables={priceTables} quotation={quotation} />;
    if (!hasPricingSection || hasOptions || isLand || isVisaQuotation) return null; // with options each option carries its own price; a land service's price is its vehicle table and a visa's its fee table
    return (
      <div className="quotation-keep" style={{ marginBottom: '14px', backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1.5px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
          Pricing Breakdown: -
        </h3>
        {pricingItems.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
            {pricingItems.filter(item => item.isIncluded !== false).map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#000000' }}>
                <span style={{ fontWeight: 600 }}>
                  • {item.name}:
                </span>
                <span style={{ fontWeight: 700, color: '#0369a1' }}>
                  Rs {item.costPerPerson?.toLocaleString('en-IN') || 0} {item.note || `Per person`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10.5px', color: '#0369a1', fontWeight: 600, marginBottom: '6px' }}>
            {pricing.packageCostPerPerson > 0 && (
              <div>
                Package: Rs {pricing.packageCostPerPerson.toLocaleString('en-IN')} {pricing.packageCostNote || `Per person X ${quotation.paxDetails || 'Pax'}`}
              </div>
            )}
            {pricing.airfareCostPerPerson > 0 && (
              <div>
                Airfare: Rs {pricing.airfareCostPerPerson.toLocaleString('en-IN')} {pricing.airfareCostNote || `Per person X ${quotation.paxDetails || 'Pax'}`}
              </div>
            )}
            {pricing.otherCostPerPerson > 0 && (
              <div>
                Other Services: Rs {pricing.otherCostPerPerson.toLocaleString('en-IN')} {pricing.otherCostNote || `Per person`}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
          <div
            style={{
              display: 'inline-block',
              backgroundColor: '#fde047',
              padding: '5px 12px',
              borderRadius: '4px',
              fontWeight: 800,
              fontSize: '12px',
              color: '#0f172a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <Line value={shownPriceNote(pricing)} />
          </div>
          {pricing.grandTotal > 0 && (
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
              {quotationType === 'Only Hotel' ? 'Grand Total' : 'Total Package'}: Rs {pricing.grandTotal.toLocaleString('en-IN')}
            </div>
          )}
        </div>
        {pricing.notes && (
          <div style={{ fontSize: '9px', color: '#000000', fontStyle: 'italic', marginTop: '6px' }}>
            Note: <Line value={pricing.notes} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div id={id} className="quotation-doc-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '24px' }}>
      {before && before({ id, DocumentHeader, DocumentFooter, pageContainerStyle })}
      {/* ================= PAGE 1: ITINERARY & TOUR OVERVIEW ================= */}
      {(!pageNumber || pageNumber === 1) && !isVisaQuotation && (hasItinerary || quotationType !== 'Only Hotel') && (
        <div className="quotation-page" id={`${id}-page-1`} style={pageContainerStyle}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <DocumentHeader />

            {/* Destination Header Banner */}
            <div style={{ textAlign: 'center', margin: '4px 0 12px 0' }}>
              <h2
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: '#0369a1',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  margin: 0
                }}
              >
                {quotation.destination || (quotationType === 'Only Hotel' ? 'HOTEL STAY PROPOSAL' : 'CUSTOM TOUR PACKAGE')}
              </h2>
              <ConfirmationLine info={confirmationInfo} align="center" />
              {quotation.duration && (
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginTop: '3px'
                  }}
                >
                  {quotation.duration}
                </div>
              )}
            </div>

            {/* Pax & Date Meta Box */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '12px',
                padding: '0 4px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: '#1e293b'
              }}
            >
              <div>
                <span style={{ color: '#000000' }}>Client:</span> <strong>{quotation.clientName || 'Valued Guest'}</strong>
                {quotation.paxDetails && (
                  <span style={{ marginLeft: '12px' }}>
                    <span style={{ color: '#000000' }}>Pax:</span> <strong>{quotation.paxDetails}</strong>
                  </span>
                )}
              </div>
              <div>
                <span style={{ color: '#000000' }}>Date:</span> <strong>{quotation.travelDate ? formatDate(quotation.travelDate) : 'Flexible'}</strong>
              </div>
            </div>

            {/* ITINERARY Bar */}
            <div
              style={{
                backgroundColor: '#fef08a',
                border: '1px solid #facc15',
                borderRadius: '4px',
                padding: '5px 12px',
                textAlign: 'center',
                fontWeight: 800,
                fontSize: '12px',
                color: '#0f172a',
                letterSpacing: '0.12em',
                marginBottom: '12px'
              }}
            >
              {quotationType === 'Events / Corporate' ? 'EVENT & TOUR SCHEDULE' : 'ITINERARY'}
            </div>

            {/* Day-by-Day List. A day is laid out as pieces (its heading with the first lines, then the rest of its text a paragraph, a line or a list item at a time),
                so a long day continues on the same page and over the next A4 pages instead of moving whole and leaving the page blank. */}
            <div className="quotation-flow" style={{ display: 'flex', flexDirection: 'column', marginBottom: '14px' }}>
              {itinerary.length > 0 ? (
                itinerary.flatMap((day, idx) => {
                  const [firstText, ...moreText] = day.description ? splitDisplayBlocks(toDocumentHtml(day.description)) : [];
                  const textStyle = { fontSize: '9.5px', lineHeight: '1.45', color: '#000000', textAlign: 'left' };
                  return [
                    <div key={`${idx}-day`} className="quotation-keep" style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: idx ? '10px' : 0 }}>
                      <div>
                        <span
                          style={{
                            display: 'inline-block',
                            fontWeight: 800,
                            fontSize: '11px',
                            color: DAY_HEADING_BLUE
                          }}
                        >
                          {day.dayNumber || `Day 0${idx + 1}`}: {day.title || 'Sightseeing & Excursions'}
                        </span>
                      </div>
                      {dayMeta(day) && (
                        <div style={{ fontSize: '8.5px', color: '#000000', fontStyle: 'italic' }}>{dayMeta(day)}</div>
                      )}
                      {firstText && <div className="qd-rich qd-part" style={{ ...textStyle, margin: '2px 0 0 0' }} dangerouslySetInnerHTML={{ __html: firstText }} />}
                    </div>,
                    ...moreText.map((html, k) => (
                      <div key={`${idx}-text-${k}`} className="quotation-keep qd-rich qd-part" style={textStyle} dangerouslySetInnerHTML={{ __html: html }} />
                    )),
                    ...(day.photos?.length ? [<div key={`${idx}-photos`} className="quotation-keep" style={{ marginTop: '3px' }}><DayPhotos photos={day.photos} /></div>] : [])
                  ];
                })
              ) : (
                <div
                  className="quotation-keep"
                  style={{
                    textAlign: 'center',
                    padding: '16px',
                    color: '#000000',
                    fontSize: '10.5px',
                    fontStyle: 'italic',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '6px'
                  }}
                >
                  Detailed day-wise itinerary will be customized as per guest preference.
                </div>
              )}

            {/* End of the Tour Itinerary Conclusion */}
            <div
              className="quotation-keep"
              style={{
                textAlign: 'center',
                margin: '8px 0 14px 0',
                padding: '6px 14px',
                backgroundColor: '#f8fafc',
                border: '1.5px dashed #cbd5e1',
                borderRadius: '6px'
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}
              >
                <Line value={quotation.endOfTourNote || '***End of the Tour***'} />
              </div>
            </div>
            </div>
          </div>

          <DocumentFooter />
        </div>
      )}

      {/* ================= PAGE 2: PACKAGE DETAILS & INCLUSIONS ================= */}
      {(!pageNumber || pageNumber === 2) && (hasPackageSection || hasPriceTables || (hasPricingSection && !hasFlightSection)) && (
        <div className="quotation-page" id={`${id}-page-2`} style={pageContainerStyle}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <DocumentHeader />

            {/* Destination & Reference Sub-bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1.5px solid #0284c7',
                paddingBottom: '4px',
                marginBottom: '12px'
              }}
            >
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📍 {quotation.destination || (quotationType === 'Only Hotel' ? 'HOTEL STAY PROPOSAL' : 'CUSTOM TOUR PACKAGE')}
                <ConfirmationLine info={confirmationInfo} />
              </div>
              <div style={{ fontSize: '10.5px', color: '#000000', fontWeight: 600 }}>
                Guest: <strong style={{ color: '#0f172a' }}>{quotation.clientName || 'Valued Guest'}</strong>
                {quotation.paxDetails && <span> • Pax: <strong style={{ color: '#0f172a' }}>{quotation.paxDetails}</strong></span>}
              </div>
            </div>

            <div className="quotation-flow" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Section: Hotel / Package Details */}
            {hasPackageSection && (
              <div style={{ marginBottom: '14px' }}>
                <h3
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#0f172a',
                    borderBottom: '1.5px solid #e2e8f0',
                    paddingBottom: '3px',
                    marginBottom: '8px'
                  }}
                >
                  {getPackageSectionTitle()}
                </h3>

                {isVisaQuotation && <VisaSection hidePrices={hidePrices} visa={visa} fees={visaFees}documents={visaDocuments} inclusions={visaInclusions} trip={{ client: quotation.clientName, pax: quotation.paxDetails, travelDate: quotation.travelDate, duration: quotation.duration, validUntil: quotation.validUntil }} />}

                {isLand && <LandServiceSection hidePrices={hidePrices} vehicles={vehicles} trip={quotation.landService || {}} inclusions={vehicleInclusions} />}

                {!isLand && !isVisaQuotation && hasOptions && (
                  hasPriceTables
                    ? /* Each option carries its own price table directly below it, for any quotation type. */
                      <HotelOptionsProposal options={options} priced tables={priceTables} quotation={quotation} />
                    : quotationType === 'Only Hotel'
                      ? <HotelOptionsProposal options={options} />
                      : <OptionsComparison options={options} paxDetails={quotation.paxDetails} />
                )}

                {/* Hotels Table / Cards Layout */}
                {!isLand && !isVisaQuotation && !hasOptions && hasHotels && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Building2 size={13} style={{ color: '#0284c7' }} />
                      <span>Accommodations & Hotel Stays</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {packageDetails.hotels.map((h, i) => (quotationType === 'Only Hotel' ? (
                        <HotelStayCard key={i} h={h} confirmed={isConfirmation} hidePrices={hidePrices} />
                      ) : (
                        <div
                          key={i}
                          className="quotation-keep"
                          style={{
                            padding: '8px 10px',
                            backgroundColor: '#f8fafc',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                        >
                          {/* Top Hotel Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, color: '#0284c7', fontSize: '11.5px' }}>
                                {h.city ? `📍 ${h.city}` : 'Destination'}
                              </span>
                              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px' }}>
                                {h.hotelName ? `@ ${h.hotelName}` : ''}
                              </span>
                              {h.roomCategory && (
                                <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#000000', background: '#e2e8f0', padding: '1px 6px', borderRadius: '3px' }}>
                                  {h.roomCategory}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {h.nights && (
                                <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '2px 7px', borderRadius: '3px' }}>
                                  ⏱ {h.nights}
                                </span>
                              )}
                              {h.starRating && (
                                <span style={{ fontSize: '9px', color: '#b45309', fontWeight: 700, background: '#fef3c7', padding: '2px 6px', borderRadius: '3px' }}>
                                  ★ {h.starRating}
                                </span>
                              )}
                            </div>
                          </div>

                          {isConfirmation && h.bookingNo && (
                            <div style={{ fontSize: '10px', color: '#0f172a', margin: '-1px 0 5px' }}>
                              <strong>Hotel Confirmation No:</strong> {h.bookingNo}
                            </div>
                          )}

                          {/* Hotel Sub-grid Attributes: Meal Plan, Dates, Rooms */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', fontSize: '9px', color: '#000000' }}>
                            {h.mealPlan && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>🍽 Meal Plan:</strong> {h.mealPlan}
                              </div>
                            )}
                            {isConfirmation && h.checkInDate && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>📅 Check In:</strong> {whenText(h.checkInDate, h.checkInTime)}
                              </div>
                            )}
                            {isConfirmation && h.checkOutDate && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>📅 Check Out:</strong> {whenText(h.checkOutDate, h.checkOutTime)}
                              </div>
                            )}
                            {!isConfirmation && (h.checkInDate || h.checkOutDate) && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>📅 Stay:</strong> {[h.checkInDate ? formatDate(h.checkInDate) : '', h.checkOutDate ? formatDate(h.checkOutDate) : ''].filter(Boolean).join(' to ')}
                              </div>
                            )}
                            {h.noOfRooms && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>🚪 Rooms:</strong> {h.noOfRooms}
                              </div>
                            )}
                            {!isConfirmation && timesLine(h) && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>🕑 Timings:</strong> {timesLine(h)}
                              </div>
                            )}
                          </div>

                          {h.photos?.length > 0 && <DayPhotos photos={h.photos.slice(0, 3)} maxRowHeight={90} />}
                          {h.amenities?.length > 0 && (
                            <div style={{ fontSize: '8.5px', color: '#000000', marginTop: '4px' }}>
                              <strong style={{ color: '#0f172a' }}>Amenities:</strong> {amenityLine(h.amenities)}
                            </div>
                          )}

                          {/* Address & Contact Info if provided */}
                          {(h.address || h.contactNumber || h.email || h.contactPerson) && (
                            <div style={{ fontSize: '8.5px', color: '#000000', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                              {h.address && (
                                <div>
                                  <strong style={{ color: '#000000' }}>Address:</strong> {h.address}
                                </div>
                              )}
                              {h.contactNumber && (
                                <div>
                                  <strong style={{ color: '#000000' }}>{isConfirmation ? 'Hotel Contact No:' : 'Phone:'}</strong> {h.contactNumber}
                                </div>
                              )}
                              {(h.email || h.contactPerson) && (
                                <div>
                                  <strong style={{ color: '#000000' }}>Contact:</strong> {[h.contactPerson, h.email].filter(Boolean).join(' | ')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )))}
                    </div>
                  </div>
                )}

                {/* Room info fallback */}
                {!isLand && !isVisaQuotation && packageDetails.roomInfo && (
                  <div className="quotation-keep" style={{ fontSize: '10.5px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                    Room Allocation: <Line value={packageDetails.roomInfo} />
                  </div>
                )}

                {/* Inclusions */}
                {!isLand && !isVisaQuotation && hasInclusions && (
                  <div>
                    <div className="quotation-keep" style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>
                      Inclusions
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', paddingLeft: '2px' }}>
                      {packageDetails.inclusions.map((inc, i) => (
                        <div key={i} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '9.5px', color: '#000000' }}>
                          <span style={{ color: '#059669', fontWeight: 800, flexShrink: 0 }}>✓</span>
                          <Line value={inc} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!hasFlightSection && <PricingSection />}
            </div>
          </div>

          <DocumentFooter />
        </div>
      )}

      {/* ================= FLIGHT DETAILS, THEN PRICE — new page ================= */}
      {(!pageNumber || pageNumber === 2) && hasFlightSection && (
        <div className="quotation-page" id={`${id}-page-flights`} style={pageContainerStyle}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <DocumentHeader />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1.5px solid #0284c7',
                paddingBottom: '4px',
                marginBottom: '12px'
              }}
            >
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📍 {quotation.destination || (quotationType === 'Only Hotel' ? 'HOTEL STAY PROPOSAL' : 'CUSTOM TOUR PACKAGE')}
                <ConfirmationLine info={confirmationInfo} />
              </div>
              <div style={{ fontSize: '10.5px', color: '#000000', fontWeight: 600 }}>
                Guest: <strong style={{ color: '#0f172a' }}>{quotation.clientName || 'Valued Guest'}</strong>
                {quotation.paxDetails && <span> • Pax: <strong style={{ color: '#0f172a' }}>{quotation.paxDetails}</strong></span>}
              </div>
            </div>

            <div className="quotation-flow" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Section: Flight Details */}
            {hasFlightSection && (
              <div style={{ marginBottom: '14px' }}>
                <h3
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 800,
                    color: '#0f172a',
                    borderBottom: '1.5px solid #e2e8f0',
                    paddingBottom: '3px',
                    marginBottom: '8px'
                  }}
                >
                  Flight Details: -
                </h3>

                {quotation.asPerFlightTicket ? (
                  <div
                    className="quotation-keep"
                    style={{
                      border: '1.5px solid #38bdf8',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      backgroundColor: '#f0f9ff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Plane size={15} style={{ color: '#0284c7' }} />
                      <span style={{ fontWeight: 800, color: '#0369a1', fontSize: '11px' }}>
                        Flight details will be as per confirmed flight ticket
                      </span>
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#000000', lineHeight: 1.4, paddingLeft: '21px' }}>
                      <Line value={quotation.flightTicketNote || 'Official airline PNR and flight e-tickets will be issued & shared upon final booking confirmation.'} />
                    </div>
                    {quotation.flightTicketUrl && (
                      <div style={{ fontSize: '8.5px', color: '#0284c7', fontWeight: 600, paddingLeft: '21px', marginTop: '2px' }}>
                        📎 Attached E-Ticket: <span style={{ textDecoration: 'underline' }}>{quotation.flightTicketUrl}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {flightDetails.map((f, i) => (
                      <div
                        key={i}
                        className="quotation-keep"
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          backgroundColor: '#ffffff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '10px',
                            fontWeight: 600,
                            color: '#000000',
                            borderBottom: '1px solid #f1f5f9',
                            paddingBottom: '4px',
                            marginBottom: '6px'
                          }}
                        >
                          <div>
                            <strong>{f.flightType || 'Departure'}</strong>: {f.departureDate ? formatDate(f.departureDate) : (f.depDate ? formatDate(f.depDate) : (quotation.travelDate ? formatDate(quotation.travelDate) : 'As confirmed'))}
                          </div>
                          <div style={{ color: '#0369a1', fontWeight: 700 }}>
                            {f.route || `${f.fromAirport || 'Origin'} → ${f.toAirport || 'Destination'}`}
                          </div>
                          <div style={{ color: '#000000' }}>
                            {f.cabinClass || 'Economy - Normal'}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr 2fr', alignItems: 'center', gap: '6px' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '11px' }}>
                              {f.airline || 'Indigo'}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '9.5px', color: '#0f172a' }}>
                              {f.flightNumber || '6E 6805'}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '9.5px', fontWeight: 600, color: '#000000' }}>
                              {f.fromAirport || 'Origin Airport'}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                              {f.depTime || '11:20'}
                            </div>
                          </div>

                          <div style={{ textAlign: 'center', padding: '0 4px' }}>
                            <div style={{ fontSize: '8.5px', color: '#000000', fontWeight: 600 }}>
                              {f.duration || 'Direct'}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '3px',
                                color: '#b91c1c',
                                margin: '1px 0'
                              }}
                            >
                              <div style={{ height: '1px', flex: 1, backgroundColor: '#cbd5e1' }} />
                              <Plane size={11} style={{ transform: 'rotate(45deg)' }} />
                              <div style={{ height: '1px', flex: 1, backgroundColor: '#cbd5e1' }} />
                            </div>
                            <div style={{ fontSize: '8px', color: '#059669', fontWeight: 700 }}>
                              {f.flightStop || 'Non-stop'}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '9.5px', fontWeight: 600, color: '#000000' }}>
                              {f.toAirport || 'Destination Airport'}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                              {f.arrTime || '13:10'}
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: '6px',
                            paddingTop: '4px',
                            borderTop: '1px dashed #e2e8f0',
                            fontSize: '9px',
                            color: '#000000',
                            display: 'flex',
                            gap: '14px'
                          }}
                        >
                          <span>Check-in: <strong>{f.baggageCheckIn || '15 kg'}</strong></span>
                          <span>Cabin: <strong>{f.baggageCabin || '7 kg'}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <PricingSection />
            </div>
          </div>

          <DocumentFooter />
        </div>
      )}

      {/* ================= TERMS, POLICIES, EXCLUSIONS & GUIDELINES — one A4 page ================= */}
      {showBackPages && (hasImportantNotes || hasPoliciesPage || hasExclusionsPage) && (
        <div className="quotation-page" id={`${id}-page-terms`} style={pageContainerStyle}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <DocumentHeader />
            <SectionBanner title="TERMS, POLICIES, EXCLUSIONS & GUIDELINES" accent="#b91c1c" />
            <div className="quotation-flow" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {hasImportantNotes && (
                <div className="quotation-keep" style={{ fontSize: '11.5px', fontWeight: 800, color: '#0f172a', marginBottom: '2px' }}>
                  TERMS
                </div>
              )}
              {importantNotes.map((note, i) => (
                <div key={i} className="quotation-keep" style={{ fontSize: '10px', color: '#000000', lineHeight: 1.45 }}>
                  {richToPlainText(note).startsWith(`${i + 1}.`) ? '' : `${i + 1}. `}<Line value={note} />
                </div>
              ))}

              {hasPoliciesPage && (
                <div className="quotation-keep" style={{ fontSize: '11.5px', fontWeight: 800, color: '#0369a1', marginTop: '10px' }}>
                  POLICIES
                </div>
              )}
              {hasPaymentPolicy && (
                <div className="quotation-keep" style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', marginTop: '2px' }}>
                  Payment Policy: -
                </div>
              )}
              {paymentPolicy.map((item, i) => (
                <div key={`pay-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#000000', lineHeight: 1.45 }}>
                  <span style={{ color: '#0284c7', fontWeight: 800, flexShrink: 0 }}>💳</span>
                  <Line value={item} />
                </div>
              ))}
              {hasCancellationPolicy && (
                <div className="quotation-keep" style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', marginTop: '8px' }}>
                  Cancellation Policy: -
                </div>
              )}
              {cancellationPolicy.map((item, i) => (
                <div key={`can-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#000000', lineHeight: 1.45 }}>
                  <span style={{ color: '#d97706', fontWeight: 800, flexShrink: 0 }}>⚠️</span>
                  <Line value={item} />
                </div>
              ))}

              {hasExclusionsPage && (
                <div className="quotation-keep" style={{ fontSize: '11.5px', fontWeight: 800, color: '#b91c1c', marginTop: '10px' }}>
                  EXCLUSIONS & GUIDELINES
                </div>
              )}
              {hasExclusions && (
                <div className="quotation-keep" style={{ fontSize: '11px', fontWeight: 800, color: '#b91c1c', marginTop: '2px' }}>
                  Exclusions:
                </div>
              )}
              {exclusions.map((exc, i) => (
                <div key={`exc-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#000000', lineHeight: 1.45 }}>
                  <span style={{ color: '#dc2626', fontWeight: 800, flexShrink: 0 }}>×</span>
                  <Line value={exc} />
                </div>
              ))}
              {hasVehicleNotes && (
                <div className="quotation-keep" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginTop: '8px' }}>
                  Points to be Noted (Vehicle Note): -
                </div>
              )}
              {vehicleNotes.map((vn, i) => (
                <div key={`vn-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#000000', lineHeight: 1.45 }}>
                  <span style={{ color: '#0f172a', fontWeight: 700, flexShrink: 0 }}>❖</span>
                  <Line value={vn} />
                </div>
              ))}
              <div className="quotation-keep" style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#000000', marginTop: '12px' }}>
                ***
              </div>
            </div>
          </div>
          <DocumentFooter />
        </div>
      )}
      {/* Last, not first: the print rules treat the first child as the first page. */}
      <style>{DAY_TEXT_CSS}</style>
    </div>
  );
};

export default QuotationDocumentView;
