import React from 'react';
import { useLocation } from 'react-router-dom';
import { Plane, Check, X, Diamond, Building2, Calendar, MapPin, Phone, Mail, Award, Coffee, Utensils, CreditCard, AlertCircle } from 'lucide-react';
import logoImg from '../assets/logo.webp';
import { formatDate } from '../utils/dateHelper';

export const QuotationDocumentView = ({ quotation, pageNumber = null, id = 'quotation-doc' }) => {
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
  const vehicleNotes = quotation.vehicleNotes || [];
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
  const hasInclusions = packageDetails.inclusions && packageDetails.inclusions.length > 0;
  const hasPackageSection = hasHotels || packageDetails.roomInfo || hasInclusions;
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

  const hasFlightSection = quotation.asPerFlightTicket || (flightDetails && flightDetails.length > 0);
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
    if (!hasPricingSection) return null;
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
            {pricing.totalCostNote || (pricing.totalCostPerPerson > 0 ? `Rs ${pricing.totalCostPerPerson.toLocaleString('en-IN')} Per person (Incl of GST)` : 'Custom Rate on Request')}
          </div>
          {pricing.grandTotal > 0 && (
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
              Total Package: Rs {pricing.grandTotal.toLocaleString('en-IN')}
            </div>
          )}
        </div>
        {pricing.notes && (
          <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', marginTop: '6px' }}>
            Note: {pricing.notes}
          </div>
        )}
      </div>
    );
  };

  return (
    <div id={id} className="quotation-doc-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '24px' }}>
      {/* ================= PAGE 1: ITINERARY & TOUR OVERVIEW ================= */}
      {(!pageNumber || pageNumber === 1) && (hasItinerary || quotationType !== 'Only Hotel') && (
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
                    {day.description && (
                      <p
                        style={{
                          fontSize: '9.5px',
                          lineHeight: '1.45',
                          color: '#1f2937',
                          margin: '2px 0 0 0',
                          textAlign: 'justify'
                        }}
                      >
                        {day.description}
                      </p>
                    )}
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
                {quotation.endOfTourNote || '***End of the Tour***'}
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

                {/* Hotels Table / Cards Layout */}
                {hasHotels && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Building2 size={13} style={{ color: '#0284c7' }} />
                      <span>Accommodations & Hotel Stays</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {packageDetails.hotels.map((h, i) => (
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
                          </div>

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
                      ))}
                    </div>
                  </div>
                )}

                {/* Room info fallback */}
                {packageDetails.roomInfo && (
                  <div className="quotation-keep" style={{ fontSize: '10.5px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                    Room Allocation: {packageDetails.roomInfo}
                  </div>
                )}

                {/* Inclusions */}
                {hasInclusions && (
                  <div>
                    <div className="quotation-keep" style={{ fontWeight: 700, fontSize: '11px', color: '#0f172a', marginBottom: '4px' }}>
                      Inclusions
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', paddingLeft: '2px' }}>
                      {packageDetails.inclusions.map((inc, i) => (
                        <div key={i} className="quotation-keep" style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '9.5px', color: '#1f2937' }}>
                          <span style={{ color: '#059669', fontWeight: 800, flexShrink: 0 }}>✓</span>
                          <span>{inc}</span>
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
                      {quotation.flightTicketNote || 'Official airline PNR and flight e-tickets will be issued & shared upon final booking confirmation.'}
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
                  {note.startsWith(`${i + 1}.`) ? note : `${i + 1}. ${note}`}
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
                  <span>{item}</span>
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
                  <span>{item}</span>
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
                  <span>{exc}</span>
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
                  <span>{vn}</span>
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
    </div>
  );
};

export default QuotationDocumentView;
