import React from 'react';
import { DiamondList, IntroBand, ListBoxes, Page, Panel, SectionBanner } from '../PageParts';
import { BadgeCheck, BadgeCross, BadgeSection, BadgeStar, BannerPagoda, IconCircleX, IconDocument } from '../art';

const Pieces = ({ html }) => <div className="qd-rich qd-booktext" dangerouslySetInnerHTML={{ __html: html }} />;

/** A pair of boxes side by side, as one block so the PDF keeps them together. */
const Pair = ({ children }) => <div className={`quotation-keep qd-grid2${React.Children.toArray(children).length < 2 ? ' one' : ''}`}>{children}</div>;

/** Two lists side by side only when each is short enough to stay on one sheet. */
const fitsPair = (a, b) => a.length + b.length > 0 && a.length <= 14 && b.length <= 14;

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
  const incTitle = land ? 'Inclusions' : 'Package Inclusions';
  const excTitle = land ? 'Exclusions' : 'Package Exclusions';
  return (
    <Page id={id} model={model} header="Booking Conditions">
      <IntroBand
        numeral={numeral}
        title={confirmation ? 'General Policy' : 'Inclusions & Conditions'}
        text={confirmation ? 'What this booking includes and the terms that apply.' : 'What the package covers, what it does not, and the terms of confirmation.'}
        art={<BannerPagoda size={52} />}
        section="terms"
      />
      {fitsPair(inclusions, exclusions) ? (
        <Pair>
          {inclusions.length > 0 && <Panel keep={false} badge={<BadgeCheck width={20} height={20} />} title={incTitle} icon={<IconDocument size={14} />}><DiamondList items={inclusions} /></Panel>}
          {exclusions.length > 0 && <Panel keep={false} badge={<BadgeCross width={20} height={20} />} title={excTitle} icon={<IconCircleX size={14} />}><DiamondList items={exclusions} /></Panel>}
        </Pair>
      ) : (
        <>
          <ListBoxes badge={<BadgeCheck width={20} height={20} />} title={incTitle} icon={<IconDocument size={14} />} items={inclusions} />
          <ListBoxes badge={<BadgeCross width={20} height={20} />} title={excTitle} icon={<IconCircleX size={14} />} items={exclusions} />
        </>
      )}
      {/* The booking's additional services (a confirmation only), straight under the inclusions. */}
      {additionalPieces.length > 0 && (
        <Panel badge={<BadgeStar width={20} height={20} />} title="Additional Services" style={{ marginBottom: 14 }}>
          {additionalPieces.map((html, i) => <Pieces key={i} html={html} />)}
        </Panel>
      )}
      {bookingTexts.map(({ title, pieces }) => (
        <Panel key={title} badge={<BadgeSection width={20} height={20} />} title={title} style={{ marginBottom: 14 }}>
          {pieces.map((html, i) => <Pieces key={i} html={html} />)}
        </Panel>
      ))}
      <ListBoxes badge={<BadgeSection width={20} height={20} />} title="General Conditions" items={notes} columns={notes.length > 2 ? 2 : 1} />
      {fitsPair(payment, cancel) ? (
        <Pair>
          {payment.length > 0 && <Panel keep={false} badge={<BadgeSection width={20} height={20} />} title="Payment Policy"><DiamondList items={payment} /></Panel>}
          {cancel.length > 0 && <Panel keep={false} badge={<BadgeCross width={20} height={20} />} title="Cancellation Policy"><DiamondList items={cancel} /></Panel>}
        </Pair>
      ) : (
        <>
          <ListBoxes badge={<BadgeSection width={20} height={20} />} title="Payment Policy" items={payment} />
          <ListBoxes badge={<BadgeCross width={20} height={20} />} title="Cancellation Policy" items={cancel} />
        </>
      )}
      <ListBoxes badge={<BadgeSection width={20} height={20} />} title="Points to be Noted (Vehicle Note)" items={vehicleNotes} columns={vehicleNotes.length > 2 ? 2 : 1} />
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
