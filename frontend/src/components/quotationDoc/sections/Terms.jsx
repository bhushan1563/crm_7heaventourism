import React from 'react';
import { DiamondList, IntroBand, Page, Panel, SectionBanner } from '../PageParts';
import { BadgeCheck, BadgeCross, BadgeSection, BadgeStar, BannerPagoda, IconCircleX, IconDocument } from '../art';

const Pieces = ({ html }) => <div className="qd-rich qd-booktext" dangerouslySetInnerHTML={{ __html: html }} />;

/** A pair of boxes side by side, as one block so the PDF keeps them together. */
const Pair = ({ children }) => <div className={`quotation-keep qd-grid2${React.Children.toArray(children).length < 2 ? ' one' : ''}`}>{children}</div>;

/**
 * "Inclusions & Conditions": what the offer covers, what it does not, the general conditions, the payment and cancellation policies and the
 * vehicle notes, then the acceptance (a quotation only). A booking confirmation prints "General Policy" with what the booking adds.
 */
export const TermsPage = ({ model, quotation, numeral, id, confirmation = false, inclusions = [], additionalPieces = [], bookingTexts = [] }) => {
  const exclusions = quotation.exclusions || [];
  const notes = quotation.importantNotes || [];
  const payment = quotation.paymentPolicy || [];
  const cancel = quotation.cancellationPolicy || [];
  const land = model.type === 'Land Service';
  const vehicleNotes = model.type === 'Visa' || model.type === 'Only Hotel' || confirmation ? [] : quotation.vehicleNotes || [];
  return (
    <Page id={id} model={model} header="Booking Conditions">
      <IntroBand
        numeral={numeral}
        title={confirmation ? 'General Policy' : 'Inclusions & Conditions'}
        text={confirmation ? 'What this booking includes and the terms that apply.' : 'What the package covers, what it does not, and the terms of confirmation.'}
        art={<BannerPagoda size={52} />}
        section="terms"
      />
      {(inclusions.length > 0 || exclusions.length > 0) && (
        <Pair>
          {inclusions.length > 0 && <Panel keep={false} badge={<BadgeCheck width={20} height={20} />} title={land ? 'Inclusions' : 'Package Inclusions'} icon={<IconDocument size={14} />}><DiamondList items={inclusions} /></Panel>}
          {exclusions.length > 0 && <Panel keep={false} badge={<BadgeCross width={20} height={20} />} title={land ? 'Exclusions' : 'Package Exclusions'} icon={<IconCircleX size={14} />}><DiamondList items={exclusions} /></Panel>}
        </Pair>
      )}
      {additionalPieces.length > 0 && (
        <Panel badge={<BadgeStar width={20} height={20} />} title="Additional Services" className="qd-spaced" style={{ marginBottom: 14 }}>
          {additionalPieces.map((html, i) => <Pieces key={i} html={html} />)}
        </Panel>
      )}
      {bookingTexts.map(({ title, pieces }) => (
        <Panel key={title} badge={<BadgeSection width={20} height={20} />} title={title} style={{ marginBottom: 14 }}>
          {pieces.map((html, i) => <Pieces key={i} html={html} />)}
        </Panel>
      ))}
      {notes.length > 0 && (
        <Panel badge={<BadgeSection width={20} height={20} />} title="General Conditions" style={{ marginBottom: 14 }}>
          <DiamondList items={notes} columns={notes.length > 2 ? 2 : 1} />
        </Panel>
      )}
      {(payment.length > 0 || cancel.length > 0) && (
        <Pair>
          {payment.length > 0 && <Panel keep={false} badge={<BadgeSection width={20} height={20} />} title="Payment Policy"><DiamondList items={payment} /></Panel>}
          {cancel.length > 0 && <Panel keep={false} badge={<BadgeCross width={20} height={20} />} title="Cancellation Policy"><DiamondList items={cancel} /></Panel>}
        </Pair>
      )}
      {vehicleNotes.length > 0 && (
        <Panel badge={<BadgeSection width={20} height={20} />} title="Points to be Noted (Vehicle Note)" style={{ marginBottom: 14 }}>
          <DiamondList items={vehicleNotes} columns={vehicleNotes.length > 2 ? 2 : 1} />
        </Panel>
      )}
      {!confirmation && (
        <div className="quotation-keep qd-accept" data-section="accept">
          <SectionBanner keep={false}>Acceptance</SectionBanner>
          <div className="qd-sign">
            <div><div className="k">For {model.company.name}</div><div className="d">Name &amp; date</div></div>
            <div><div className="k">Guest signature</div><div className="d">Name &amp; date</div></div>
          </div>
          <p className="qd-fine">This itinerary is a proposal. Services, hotels and activities are confirmed only after written acceptance and receipt of the applicable booking amount. Quoted inclusions remain subject to availability at the time of confirmation.</p>
        </div>
      )}
    </Page>
  );
};
