import React, { useLayoutEffect, useRef } from 'react';
import { richToPlainText, splitDisplayBlocks, toDocumentHtml } from '../utils/richText';
import { priceListLines } from '../utils/pricingLines';
import { tableHasData, tablesOf } from '../utils/priceTables';
import { DOC_CSS } from './quotationDoc/docCss';
import { BackCover, Cover } from './quotationDoc/Cover';
import { Page } from './quotationDoc/PageParts';
import { buildModel, overviewRows } from './quotationDoc/model';
import { finalizeDocument } from './quotationDoc/finalize';
import { WelcomePage } from './quotationDoc/sections/Welcome';
import { JourneyPage, ShapePage } from './quotationDoc/sections/Journey';
import { DaysPage } from './quotationDoc/sections/Days';
import { StayPage } from './quotationDoc/sections/Stay';
import { FlightsPage } from './quotationDoc/sections/Flights';
import { PriceList, PriceTables, PricingPage } from './quotationDoc/sections/Pricing';
import { TermsPage } from './quotationDoc/sections/Terms';
import { LandPage, VisaPage } from './quotationDoc/sections/Services';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const STAY_TITLE = { 'Only Hotel': 'Hotel & Accommodation', 'Events / Corporate': 'Venue & Accommodation' };

/**
 * The quotation as a document: a cover, a welcome letter with the contents, then the journey, the days, the hotels, the flights, the price,
 * the conditions and the acceptance, and a closing page. Every page is drawn at A4 size (794 x 1123 px at 96 dpi); the PDF splits a page
 * that has more than a sheet of content (see quotationPdfGenerator). A booking confirmation (`confirmationInfo`) has no welcome letter and
 * carries the booking page(s) that `before` draws, right after the cover.
 */
export const QuotationDocumentView = ({ quotation, id = 'quotation-doc', before = null }) => {
  const rootRef = useRef(null);
  useLayoutEffect(() => { finalizeDocument(rootRef.current); });
  if (!quotation) return null;

  const confirmationInfo = quotation.confirmationInfo || null;
  const isConfirmation = Boolean(confirmationInfo);
  const model = buildModel(quotation, { confirmation: isConfirmation });
  const { type } = model;
  const isVisa = type === 'Visa';
  const isLand = type === 'Land Service';
  // A booking confirmation does not print prices unless the booking says so (the "Show prices on the voucher" switch).
  const hidePrices = isConfirmation && !confirmationInfo.showPricing;

  const itinerary = quotation.itinerary || [];
  const packageDetails = quotation.packageDetails || {};
  const hotels = packageDetails.hotels || [];
  const options = quotation.options || [];
  const hasOptions = options.length > 0;
  const pricing = quotation.pricing || {};
  const roomText = richToPlainText(packageDetails.roomInfo || '').trim();
  const hasRoomText = Boolean(roomText) && roomText !== '2 Rooms'; // "2 Rooms" is what a new quotation starts with
  const hasInclusions = (packageDetails.inclusions || []).length > 0;

  const priceTables = hidePrices ? [] : tablesOf(quotation).filter(tableHasData);
  const hasPriceTables = priceTables.length > 0;
  const pricingItems = pricing.items?.length ? pricing.items : [];
  const hasPricingSection = !hidePrices && Boolean(pricingItems.length > 0 || pricing.packageCostPerPerson > 0 || pricing.airfareCostPerPerson > 0 || pricing.otherCostPerPerson > 0 || pricing.totalCostPerPerson > 0 || pricing.grandTotal > 0 || pricing.totalCostNote);
  // What the pricing page holds: the tables; or the price list; or, when the hotel options carry their own prices, only what is typed on top of them.
  let pricingMode = null;
  if (hasPriceTables && !hasOptions) pricingMode = 'tables';
  else if (!hasPriceTables && hasPricingSection && !isLand && !isVisa) {
    pricingMode = hasOptions ? (priceListLines(pricing, { extrasOnly: true }).length ? 'extras' : null) : 'list';
  }

  const flightImages = quotation.flightImages || [];
  const hasFlights = !isVisa && Boolean(quotation.asPerFlightTicket || (quotation.flightDetails || []).length > 0 || flightImages.length > 0);

  // A booking's own free texts (a confirmation only), one piece per line so a long text can run over the page.
  const bookingPieces = (html) => (isConfirmation && richToPlainText(html || '').trim() ? splitDisplayBlocks(toDocumentHtml(html)) : []);
  const additionalPieces = bookingPieces(confirmationInfo?.additionalServices);
  const importantPieces = bookingPieces(confirmationInfo?.importantNotes);
  const bookingTexts = importantPieces.length ? [{ title: 'Important Notes', pieces: importantPieces }] : [];

  const inclusions = !isLand && !isVisa ? packageDetails.inclusions || [] : [];
  const vehicleNotes = isVisa || type === 'Only Hotel' || isConfirmation ? [] : quotation.vehicleNotes || [];
  const hasTerms =
    !isVisa &&
    (hasInclusions || (quotation.exclusions || []).length > 0 || (quotation.importantNotes || []).length > 0 || (quotation.paymentPolicy || []).length > 0 || (quotation.cancellationPolicy || []).length > 0 || vehicleNotes.length > 0 || bookingTexts.length > 0 || additionalPieces.length > 0);

  const has = {
    journey: !isVisa && !isLand && (model.stops.length > 0 || (!hasOptions && overviewRows(quotation).length > 0)),
    days: !isVisa && !isLand && itinerary.length > 0,
    stay: !isVisa && !isLand && (hotels.length > 0 || hasOptions || hasRoomText), // a page of its own only when there is something to show (the untouched default "2 Rooms" alone is not)
    visa: isVisa,
    land: isLand,
    flights: hasFlights,
    pricing: pricingMode !== null,
    terms: hasTerms
  };
  const sections = [];
  const add = (key, title) => has[key] && sections.push({ key, title });
  add('journey', 'The Journey');
  add('days', 'Day by Day');
  add('stay', STAY_TITLE[type] || 'Accommodation');
  add('visa', 'Visa Details');
  add('land', 'Vehicle & Rates');
  add('flights', 'Flight Details');
  add('pricing', 'Pricing');
  add('terms', isConfirmation ? 'General Policy' : 'Inclusions & Conditions');
  if (has.terms && !isConfirmation) sections.push({ key: 'accept', title: 'Acceptance' });
  sections.forEach((s, i) => { s.numeral = ROMAN[i] || String(i + 1); });
  const numeral = (key) => sections.find((s) => s.key === key)?.numeral || '';

  const pageId = (name) => `${id}-${name}`;
  const parts = { id, renderPage: (pageIdValue, children, header = 'Booking Confirmation') => <Page id={pageIdValue} model={model} header={header}>{children}</Page> };

  return (
    <div id={id} ref={rootRef} className="quotation-doc-container qd" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '24px' }}>
      <Cover model={model} quotation={quotation} id={pageId('cover')} />
      {before && before(parts)}
      {!isConfirmation && <WelcomePage model={model} sections={sections} id={pageId('welcome')} />}
      {has.journey && <JourneyPage model={model} quotation={quotation} numeral={numeral('journey')} id={pageId('journey')} />}
      {has.days && <ShapePage model={model} quotation={quotation} id={pageId('shape')} />}
      {has.days && <DaysPage model={model} quotation={quotation} id={pageId('days')} />}
      {has.stay && <StayPage model={model} quotation={quotation} numeral={numeral('stay')} id={pageId('stay')} tables={priceTables} priced={hasPriceTables} hidePrices={hidePrices} confirmed={isConfirmation} />}
      {has.visa && <VisaPage model={model} quotation={quotation} numeral={numeral('visa')} id={pageId('visa')} hidePrices={hidePrices} />}
      {has.land && <LandPage model={model} quotation={quotation} numeral={numeral('land')} id={pageId('land')} hidePrices={hidePrices} />}
      {has.flights && <FlightsPage model={model} quotation={quotation} numeral={numeral('flights')} id={pageId('flights')} />}
      {has.pricing && (
        <PricingPage model={model} quotation={quotation} numeral={numeral('pricing')} id={pageId('pricing')}>
          {pricingMode === 'tables' ? <PriceTables tables={priceTables} quotation={quotation} /> : <PriceList quotation={quotation} pricing={pricing} hasOptions={hasOptions} type={type} />}
        </PricingPage>
      )}
      {has.terms && <TermsPage model={model} quotation={quotation} numeral={numeral('terms')} id={pageId('terms')} confirmation={isConfirmation} inclusions={inclusions} additionalPieces={additionalPieces} bookingTexts={bookingTexts} />}
      <BackCover model={model} id={pageId('back')} />
      {/* Last, not first: the print rules treat the first child as the first page. */}
      <style>{DOC_CSS}</style>
    </div>
  );
};

export default QuotationDocumentView;
