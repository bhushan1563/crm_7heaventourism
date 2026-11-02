import React from 'react';
import { useLocation } from 'react-router-dom';
import { Plane, Check, X, Diamond, Building2, Calendar, MapPin, Phone, Mail, Award, Coffee, Utensils, CreditCard, AlertCircle } from 'lucide-react';
import logoImg from '../assets/logo.webp';
import { formatDate } from '../utils/dateHelper';
import { richToPlainText, toDisplayHtml } from '../utils/richText';
import { dayMeta, photoRows } from '../utils/itineraryDoc';
import { vehicleTotal } from '../utils/landService';
import { feeAmount, visaFeeTotal } from '../utils/visa';
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
.qd-rich mark { padding: 0 1px; border-radius: 2px; color: #111827; }
.qd-rich [style^="color:"] mark, .qd-rich [style*=";color:"] mark, .qd-rich [style*="; color:"] mark { color: inherit; }
/* One line of a list (an inclusion, a policy, a note): formatted text that runs on like ordinary text. */
.qd-line p { display: inline; margin: 0; }
.qd-line ul, .qd-line ol { margin: 0; }
`;

/** A line of a list on the document. Plain text from older quotations prints exactly as before; formatted text keeps its bold, colour, highlight and size. */
const Line = ({ value }) => <span className="qd-rich qd-line" dangerouslySetInnerHTML={{ __html: toDisplayHtml(value) }} />;

const photoCrossOrigin = API_ORIGIN ? 'anonymous' : undefined;

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
                {photo.caption && <figcaption style={{ marginTop: '2px', fontSize: '8px', color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>{photo.caption}</figcaption>}
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

/**
 * One hotel of a HOTEL quotation. A hotel quotation shows more about the hotel than a package does: a large cover photo
 * with a strip of more photos, the address and contact details, the stay, the room and meal plan, the check-in and
 * check-out times and the amenities.
 */
const HotelStayCard = ({ h }) => {
  const [cover, ...more] = h.photos || [];
  const facts = [
    (h.checkInDate || h.checkOutDate) && ['Stay', [h.checkInDate ? formatDate(h.checkInDate) : '', h.checkOutDate ? formatDate(h.checkOutDate) : ''].filter(Boolean).join(' to ')],
    h.nights && ['Nights', h.nights],
    h.noOfRooms && ['Rooms', h.noOfRooms],
    h.roomCategory && ['Room', h.roomCategory],
    h.mealPlan && ['Meal plan', h.mealPlan],
    timesLine(h) && ['Timings', timesLine(h)]
  ].filter(Boolean);
  return (
    <div className="quotation-keep" style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {cover && (
        <figure style={{ margin: 0 }}>
          <img src={mediaUrl(cover.token)} alt={cover.caption || h.hotelName || ''} width={cover.width} height={cover.height} crossOrigin={photoCrossOrigin} style={{ display: 'block', width: '100%', height: '175px', objectFit: 'cover' }} />
          {cover.caption && <figcaption style={{ padding: '2px 8px', fontSize: '8px', color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>{cover.caption}</figcaption>}
        </figure>
      )}
      {more.length > 0 && <div style={{ padding: '6px 8px 0' }}><DayPhotos photos={more.slice(0, 3)} maxRowHeight={85} /></div>}
      <div style={{ padding: '9px 12px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>{h.hotelName || 'Hotel'}</div>
            {(h.city || h.address) && <div style={{ fontSize: '9.5px', color: '#475569', marginTop: '2px' }}>📍 {[h.address, h.city].filter(Boolean).join(', ')}</div>}
          </div>
          {h.starRating && h.starRating !== 'Unrated' && (
            <span style={{ flex: 'none', fontSize: '9px', color: '#b45309', fontWeight: 700, background: '#fef3c7', padding: '2px 7px', borderRadius: '3px' }}>★ {h.starRating}</span>
          )}
        </div>
        {facts.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '4px 12px', marginTop: '7px', paddingTop: '6px', borderTop: '1px solid #e2e8f0', fontSize: '9px', color: '#334155' }}>
            {facts.map(([label, value]) => (
              <div key={label}>
                <strong style={{ color: '#0f172a' }}>{label}:</strong> {value}
              </div>
            ))}
          </div>
        )}
        {h.amenities?.length > 0 && (
          <div style={{ marginTop: '6px', fontSize: '8.5px', color: '#475569' }}>
            <strong style={{ color: '#0f172a' }}>Amenities:</strong> {amenityLine(h.amenities)}
          </div>
        )}
        {(h.contactNumber || h.email || h.contactPerson) && (
          <div style={{ marginTop: '5px', fontSize: '8.5px', color: '#64748b' }}>
            {[h.contactNumber && `Phone: ${h.contactNumber}`, h.contactPerson && `Contact: ${h.contactPerson}`, h.email && `Email: ${h.email}`].filter(Boolean).join('  |  ')}
          </div>
        )}
      </div>
    </div>
  );
};

const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * The body of a VISA quotation: the visa itself, the documents the applicants must bring (a checklist), the fees (per applicant or
 * for the whole group) with their total, and what the service includes. The price of the quotation is the fee table.
 */
const VisaSection = ({ visa, fees, documents, inclusions }) => {
  const applicants = Math.max(1, Number(visa.applicants) || 1);
  const total = visaFeeTotal(fees, applicants);
  const columns = '3fr 1.7fr 1.1fr 1.2fr';
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
  const cell = { padding: '4px 6px', fontSize: '9.5px', color: '#1f2937' };
  const checklist = (title, items, tick) => (
    <div style={{ marginBottom: '10px' }}>
      <div className="quotation-keep" style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', paddingLeft: '2px' }}>
        {items.map((item, i) => (
          <div key={i} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '9.5px', color: '#1f2937' }}>
            <span style={{ color: '#059669', fontWeight: 800, flexShrink: 0 }}>{tick}</span>
            <Line value={item} />
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      {facts.length > 0 && (
        <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3px 14px', marginBottom: '10px', padding: '6px 9px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '9.5px', color: '#334155' }}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <strong style={{ color: '#0f172a' }}>{label}:</strong> {value}
            </div>
          ))}
        </div>
      )}

      {documents.length > 0 && checklist('Documents Required', documents, '✓')}

      {fees.length > 0 && (
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
      {visa.priceNote && <div className="quotation-keep" style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', marginBottom: '10px' }}>Note: <Line value={visa.priceNote} /></div>}

      {inclusions.length > 0 && checklist('Visa Inclusions', inclusions, '✓')}
    </div>
  );
};

/**
 * The vehicle part of a LAND SERVICE quotation (vehicle only): the trip, a table of vehicles with their rates and amounts,
 * the total, and what the vehicle includes. The price of the quotation is this table.
 */
const LandServiceSection = ({ vehicles, trip, inclusions }) => {
  const total = vehicleTotal(vehicles);
  const columns = '2.7fr 0.7fr 0.85fr 0.6fr 1.15fr 1.25fr';
  const facts = [['Route', trip.route], ['Pick-up', trip.pickupPoint], ['Drop', trip.dropPoint], ['Kilometres', trip.kmPolicy]].filter(([, v]) => v);
  const cell = { padding: '4px 6px', fontSize: '9.5px', color: '#1f2937' };
  return (
    <div>
      {facts.length > 0 && (
        <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3px 14px', marginBottom: '8px', padding: '6px 9px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '9.5px', color: '#334155' }}>
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
            {['Vehicle', 'Seats', 'AC', 'Qty', 'Rate / vehicle', 'Amount'].map((h, i) => (
              <div key={h} style={{ padding: '5px 6px', textAlign: i >= 4 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {vehicles.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: columns, borderTop: '1px solid #e2e8f0', backgroundColor: i % 2 ? '#f8fafc' : '#ffffff', alignItems: 'start' }}>
              <div style={{ ...cell, fontWeight: 700, color: '#0f172a' }}>
                {v.vehicleType || 'Vehicle'}
                {v.notes && <div style={{ fontWeight: 400, fontSize: '8.5px', color: '#64748b' }}><Line value={v.notes} /></div>}
              </div>
              <div style={cell}>{v.seats > 0 ? v.seats : '–'}</div>
              <div style={cell}>{v.acType || '–'}</div>
              <div style={cell}>{v.quantity}</div>
              <div style={{ ...cell, textAlign: 'right' }}>{rs(v.rate)}</div>
              <div style={{ ...cell, textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{rs((Number(v.quantity) || 0) * (Number(v.rate) || 0))}</div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '5.6fr 1.25fr', borderTop: '2px solid #0f172a', backgroundColor: '#fef9c3' }}>
            <div style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800, color: '#0f172a' }}>Total for the trip</div>
            <div style={{ padding: '6px 6px', fontSize: '11.5px', fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{total > 0 ? rs(total) : 'On request'}</div>
          </div>
        </div>
      )}
      {trip.priceNote && <div className="quotation-keep" style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', marginBottom: '10px' }}>Note: <Line value={trip.priceNote} /></div>}

      {inclusions.length > 0 && (
        <div>
          <div className="quotation-keep" style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>Vehicle Inclusions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', paddingLeft: '2px' }}>
            {inclusions.map((inc, i) => (
              <div key={i} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '9.5px', color: '#1f2937' }}>
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

/**
 * Hotel options side by side: one card per option with its hotels and its price per person. The cheapest price is not
 * singled out (the guest compares); an option the sales person recommends carries a ribbon.
 */
const OptionsComparison = ({ options, paxDetails }) => {
  const columns = Math.min(options.length, 3);
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Building2 size={13} style={{ color: '#0284c7' }} />
        <span>Hotel Options</span>
      </div>
      <div style={{ fontSize: '8.5px', color: '#64748b', marginBottom: '6px' }}>Please choose the option that suits you best.{paxDetails ? ` Prices are for ${paxDetails}.` : ''}</div>
      <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '8px', alignItems: 'stretch' }}>
        {options.map((option, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', border: option.recommended ? '2px solid #f59e0b' : '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            {option.recommended && <div style={{ background: '#f59e0b', color: '#ffffff', fontSize: '8px', fontWeight: 800, letterSpacing: '0.1em', textAlign: 'center', padding: '2px 0' }}>★ RECOMMENDED</div>}
            <div style={{ background: '#0f172a', color: '#ffffff', fontSize: '10.5px', fontWeight: 800, padding: '5px 8px' }}>{option.name || `Option ${i + 1}`}</div>
            <div style={{ padding: '7px 8px 6px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0369a1', lineHeight: 1.1 }}>{option.pricePerPerson > 0 ? rs(option.pricePerPerson) : 'On request'}</div>
              <div style={{ fontSize: '8px', color: '#64748b', marginTop: '1px' }}><Line value={option.priceNote || 'Per person'} /></div>
              {option.pricePerPerson > 0 && option.totalPrice > 0 && <div style={{ fontSize: '8.5px', color: '#0f172a', fontWeight: 700, marginTop: '3px' }}>Total: {rs(option.totalPrice)}</div>}
            </div>
            <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 }}>
              {option.hotels.map((h, k) => (
                <div key={k}>
                  {h.photos?.[0] && <img src={mediaUrl(h.photos[0].token)} alt={h.hotelName || ''} width={h.photos[0].width} height={h.photos[0].height} crossOrigin={photoCrossOrigin} style={{ display: 'block', width: '100%', height: '62px', objectFit: 'cover', borderRadius: '4px', marginBottom: '3px' }} />}
                  <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                    {h.hotelName || 'Hotel'}
                    {h.starRating && h.starRating !== 'Unrated' && <span style={{ marginLeft: '4px', fontSize: '8px', color: '#b45309', fontWeight: 700 }}>★ {h.starRating}</span>}
                  </div>
                  {h.city && <div style={{ fontSize: '8px', color: '#64748b' }}>📍 {h.city}</div>}
                  <div style={{ fontSize: '8px', color: '#334155', marginTop: '1px' }}>{[h.nights, h.roomCategory, h.mealPlan, h.noOfRooms].filter(Boolean).join('  •  ')}</div>
                  {h.amenities?.length > 0 && <div style={{ fontSize: '7.5px', color: '#64748b', marginTop: '1px' }}>{amenityLine(h.amenities.slice(0, 4))}</div>}
                </div>
              ))}
              {option.hotels.length === 0 && <div style={{ fontSize: '8.5px', color: '#94a3b8', fontStyle: 'italic' }}>Hotels to be confirmed</div>}
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
    tagline: 'Travel with the Trust',
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
  const vehicleNotes = quotationType === 'Visa' ? [] : quotation.vehicleNotes || []; // a visa has no vehicle
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
              {company.tagline || 'Travel with the Trust'}
            </div>
          </div>
        </div>

        {/* Right: Quotation Ref No, Type & Date */}
        <div style={{ textAlign: 'right', fontSize: '11px', color: '#64748b' }}>
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
        color: '#334155',
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
  const hasPricingSection =
    pricingItems.length > 0 ||
    pricing.packageCostPerPerson > 0 ||
    pricing.airfareCostPerPerson > 0 ||
    pricing.otherCostPerPerson > 0 ||
    pricing.totalCostPerPerson > 0 ||
    pricing.grandTotal > 0 ||
    pricing.totalCostNote;

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

  const showBackPages = !pageNumber || pageNumber === 3;
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
      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
        Ref: <strong style={{ color: '#0f172a' }}>{quotation.quotationNo || '7H-QT-2026'}</strong>
      </div>
    </div>
  );

  const PricingSection = () => {
    if (!hasPricingSection || hasOptions || isLand || isVisaQuotation) return null; // with options each option carries its own price; a land service's price is its vehicle table and a visa's its fee table
    return (
      <div className="quotation-keep" style={{ marginBottom: '14px', backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1.5px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
          Pricing Breakdown: -
        </h3>
        {pricingItems.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
            {pricingItems.filter(item => item.isIncluded !== false).map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#334155' }}>
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
            <Line value={pricing.totalCostNote || (pricing.totalCostPerPerson > 0 ? `Rs ${pricing.totalCostPerPerson.toLocaleString('en-IN')} Per person (Incl of GST)` : 'Custom Rate on Request')} />
          </div>
          {pricing.grandTotal > 0 && (
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
              Total Package: Rs {pricing.grandTotal.toLocaleString('en-IN')}
            </div>
          )}
        </div>
        {pricing.notes && (
          <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', marginTop: '6px' }}>
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
                <span style={{ color: '#64748b' }}>Client:</span> <strong>{quotation.clientName || 'Valued Guest'}</strong>
                {quotation.paxDetails && (
                  <span style={{ marginLeft: '12px' }}>
                    <span style={{ color: '#64748b' }}>Pax:</span> <strong>{quotation.paxDetails}</strong>
                  </span>
                )}
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Date:</span> <strong>{quotation.travelDate ? formatDate(quotation.travelDate) : 'Flexible'}</strong>
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

            {/* Day-by-Day List. Each day is kept together; overflow continues on the next A4 page. */}
            <div className="quotation-flow" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              {itinerary.length > 0 ? (
                itinerary.map((day, idx) => (
                  <div key={idx} className="quotation-keep" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          backgroundColor: '#fde047',
                          padding: '2px 8px',
                          borderRadius: '3px',
                          fontWeight: 700,
                          fontSize: '10.5px',
                          color: '#0f172a'
                        }}
                      >
                        {day.dayNumber || `Day 0${idx + 1}`}: {day.title || 'Sightseeing & Excursions'}
                      </span>
                    </div>
                    {dayMeta(day) && (
                      <div style={{ fontSize: '8.5px', color: '#64748b', fontStyle: 'italic' }}>{dayMeta(day)}</div>
                    )}
                    {day.description && (
                      <div
                        className="qd-rich"
                        style={{
                          fontSize: '9.5px',
                          lineHeight: '1.45',
                          color: '#1f2937',
                          margin: '2px 0 0 0',
                          textAlign: 'justify'
                        }}
                        dangerouslySetInnerHTML={{ __html: toDisplayHtml(day.description) }}
                      />
                    )}
                    <DayPhotos photos={day.photos} />
                  </div>
                ))
              ) : (
                <div
                  className="quotation-keep"
                  style={{
                    textAlign: 'center',
                    padding: '16px',
                    color: '#64748b',
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
      {(!pageNumber || pageNumber === 2) && (hasPackageSection || (hasPricingSection && !hasFlightSection)) && (
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
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
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

                {isVisaQuotation && <VisaSection visa={visa} fees={visaFees} documents={visaDocuments} inclusions={visaInclusions} />}

                {isLand && <LandServiceSection vehicles={vehicles} trip={quotation.landService || {}} inclusions={vehicleInclusions} />}

                {!isLand && !isVisaQuotation && hasOptions && <OptionsComparison options={options} paxDetails={quotation.paxDetails} />}

                {/* Hotels Table / Cards Layout */}
                {!isLand && !isVisaQuotation && !hasOptions && hasHotels && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Building2 size={13} style={{ color: '#0284c7' }} />
                      <span>Accommodations & Hotel Stays</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {packageDetails.hotels.map((h, i) => (quotationType === 'Only Hotel' ? (
                        <HotelStayCard key={i} h={h} />
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
                                <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#475569', background: '#e2e8f0', padding: '1px 6px', borderRadius: '3px' }}>
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

                          {/* Hotel Sub-grid Attributes: Meal Plan, Dates, Rooms */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', fontSize: '9px', color: '#334155' }}>
                            {h.mealPlan && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>🍽 Meal Plan:</strong> {h.mealPlan}
                              </div>
                            )}
                            {(h.checkInDate || h.checkOutDate) && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>📅 Stay:</strong> {[h.checkInDate ? formatDate(h.checkInDate) : '', h.checkOutDate ? formatDate(h.checkOutDate) : ''].filter(Boolean).join(' to ')}
                              </div>
                            )}
                            {h.noOfRooms && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>🚪 Rooms:</strong> {h.noOfRooms}
                              </div>
                            )}
                            {timesLine(h) && (
                              <div>
                                <strong style={{ color: '#0f172a' }}>🕑 Timings:</strong> {timesLine(h)}
                              </div>
                            )}
                          </div>

                          {h.photos?.length > 0 && <DayPhotos photos={h.photos.slice(0, 3)} maxRowHeight={90} />}
                          {h.amenities?.length > 0 && (
                            <div style={{ fontSize: '8.5px', color: '#475569', marginTop: '4px' }}>
                              <strong style={{ color: '#0f172a' }}>Amenities:</strong> {amenityLine(h.amenities)}
                            </div>
                          )}

                          {/* Address & Contact Info if provided */}
                          {(h.address || h.contactNumber || h.email || h.contactPerson) && (
                            <div style={{ fontSize: '8.5px', color: '#64748b', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                              {h.address && (
                                <div>
                                  <strong style={{ color: '#334155' }}>Address:</strong> {h.address}
                                </div>
                              )}
                              {h.contactNumber && (
                                <div>
                                  <strong style={{ color: '#334155' }}>Phone:</strong> {h.contactNumber}
                                </div>
                              )}
                              {(h.email || h.contactPerson) && (
                                <div>
                                  <strong style={{ color: '#334155' }}>Contact:</strong> {[h.contactPerson, h.email].filter(Boolean).join(' | ')}
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
                        <div key={i} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '9.5px', color: '#1f2937' }}>
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
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
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
                    <div style={{ fontSize: '9.5px', color: '#334155', lineHeight: 1.4, paddingLeft: '21px' }}>
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
                            color: '#475569',
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
                          <div style={{ color: '#64748b' }}>
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
                            <div style={{ fontSize: '9.5px', fontWeight: 600, color: '#64748b' }}>
                              {f.fromAirport || 'Origin Airport'}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                              {f.depTime || '11:20'}
                            </div>
                          </div>

                          <div style={{ textAlign: 'center', padding: '0 4px' }}>
                            <div style={{ fontSize: '8.5px', color: '#64748b', fontWeight: 600 }}>
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
                            <div style={{ fontSize: '9.5px', fontWeight: 600, color: '#64748b' }}>
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
                            color: '#475569',
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
                <div key={i} className="quotation-keep" style={{ fontSize: '10px', color: '#1f2937', lineHeight: 1.45 }}>
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
                <div key={`pay-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#1f2937', lineHeight: 1.45 }}>
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
                <div key={`can-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#1f2937', lineHeight: 1.45 }}>
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
                <div key={`exc-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#1f2937', lineHeight: 1.45 }}>
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
                <div key={`vn-${i}`} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '10px', color: '#1f2937', lineHeight: 1.45 }}>
                  <span style={{ color: '#0f172a', fontWeight: 700, flexShrink: 0 }}>❖</span>
                  <Line value={vn} />
                </div>
              ))}
              <div className="quotation-keep" style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#64748b', marginTop: '12px' }}>
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
