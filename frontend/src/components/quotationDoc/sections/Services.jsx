import React from 'react';
import { IntroBand, Page, Panel, RichLine } from '../PageParts';
import { BadgeCheck, BadgeSection, BannerPagoda } from '../art';
import { formatDate } from '../../../utils/dateHelper';
import { feeAmount, visaFeeTotal } from '../../../utils/visa';
import { vehicleTotal } from '../../../utils/landService';

const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

const Facts = ({ facts, testId }) =>
  facts.length > 0 ? (
    <Panel badge={<BadgeSection width={20} height={20} />} title={testId ? 'Trip Details' : 'Details'} style={{ marginBottom: 14 }}>
      <div className="qd-kv" data-testid={testId}>{facts.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}</div>
    </Panel>
  ) : null;

const Checklist = ({ title, items, badge }) => (
  <Panel badge={badge} title={title} style={{ marginBottom: 14 }}>
    <ul className="qd-check">{items.map((item, i) => <li key={i}><i>✓</i><RichLine html={item} /></li>)}</ul>
  </Panel>
);

/** The body of a VISA quotation: the visa, the documents the applicants bring, the fees with their total, and what the service includes. */
export const VisaPage = ({ model, quotation, numeral, id, hidePrices }) => {
  const visa = quotation.visa || {};
  const fees = quotation.visaFees || [];
  const applicants = Math.max(1, Number(visa.applicants) || 1);
  const total = visaFeeTotal(fees, applicants);
  const tripFacts = [['Client', quotation.clientName], ['Travellers', quotation.paxDetails], ['Travel date', quotation.travelDate ? formatDate(quotation.travelDate) : ''], ['Duration', quotation.duration], ['Quotation valid until', quotation.validUntil ? formatDate(quotation.validUntil) : '']].filter(([, v]) => v);
  const facts = [['Country', visa.country], ['Visa type', visa.visaType], ['Entry', visa.entryType], ['Issued as', visa.mode], ['Processing time', visa.processingTime], ['Validity', visa.validity], ['Length of stay', visa.stay], ['Applicants', String(applicants)]].filter(([, v]) => v);
  const documents = quotation.visaDocuments || [];
  const inclusions = quotation.visaInclusions || [];
  return (
    <Page id={id} model={model} header="Visa Details">
      <IntroBand numeral={numeral} title="Visa Details" text="What we are applying for, what we need from each applicant, and what it costs." art={<BannerPagoda size={52} />} section="visa" />
      <Facts facts={tripFacts} testId="visa-trip-details" />
      <Facts facts={facts} />
      {documents.length > 0 && <Checklist title="Documents Required" items={documents} badge={<BadgeCheck width={20} height={20} />} />}
      {!hidePrices && fees.length > 0 && (
        <div className="quotation-keep">
          <table className="qd-table">
            <thead><tr><th style={{ textAlign: 'left' }}>Fee</th><th>Charged</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>
              {fees.map((f, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{f.label || 'Fee'}</td>
                  <td className="c">{f.per === 'group' ? 'Whole group' : `Per applicant × ${applicants}`}</td>
                  <td className="r">{rs(f.amount)}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{rs(feeAmount(f, applicants))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="qd-total"><span>Total for {applicants} applicant{applicants === 1 ? '' : 's'}</span><span className="v">{total > 0 ? rs(total) : 'On request'}</span></div>
        </div>
      )}
      {!hidePrices && visa.priceNote && <div className="quotation-keep qd-note" style={{ fontStyle: 'italic' }}>Note: <RichLine html={visa.priceNote} /></div>}
      {inclusions.length > 0 && <Checklist title="Visa Inclusions" items={inclusions} badge={<BadgeCheck width={20} height={20} />} />}
    </Page>
  );
};

/** The vehicle part of a LAND SERVICE quotation: the trip, a table of vehicles with their rates, the total, and what the vehicle includes. */
export const LandPage = ({ model, quotation, numeral, id, hidePrices }) => {
  const vehicles = quotation.vehicles || [];
  const trip = quotation.landService || {};
  const inclusions = quotation.vehicleInclusions || [];
  const total = vehicleTotal(vehicles);
  const facts = [['Route', trip.route], ['Pick-up', trip.pickupPoint], ['Drop', trip.dropPoint], ['Kilometres', trip.kmPolicy]].filter(([, v]) => v);
  return (
    <Page id={id} model={model} header="Vehicle & Rates">
      <IntroBand numeral={numeral} title="Vehicle & Rates" text="The vehicles arranged for your party, and what they cost." art={<BannerPagoda size={52} />} section="land" />
      <Facts facts={facts} />
      {vehicles.length > 0 && (
        <div className="quotation-keep">
          <table className="qd-table">
            <thead>
              <tr><th style={{ textAlign: 'left' }}>Vehicle</th><th>Seats</th><th>AC</th><th>Qty</th>{!hidePrices && <th>Rate / vehicle</th>}{!hidePrices && <th>Amount</th>}</tr>
            </thead>
            <tbody>
              {vehicles.map((v, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{v.vehicleType || 'Vehicle'}{v.notes && <div style={{ fontWeight: 400, fontSize: 10.5, color: '#3b525b' }}><RichLine html={v.notes} /></div>}</td>
                  <td className="c">{v.seats > 0 ? v.seats : '–'}</td>
                  <td className="c">{v.acType || '–'}</td>
                  <td className="c">{v.quantity}</td>
                  {!hidePrices && <td className="r">{rs(v.rate)}</td>}
                  {!hidePrices && <td className="r" style={{ fontWeight: 700 }}>{rs((Number(v.quantity) || 0) * (Number(v.rate) || 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!hidePrices && <div className="qd-total"><span>Total for the trip</span><span className="v">{total > 0 ? rs(total) : 'On request'}</span></div>}
        </div>
      )}
      {!hidePrices && trip.priceNote && <div className="quotation-keep qd-note" style={{ fontStyle: 'italic' }}>Note: <RichLine html={trip.priceNote} /></div>}
      {inclusions.length > 0 && <Checklist title="Vehicle Inclusions" items={inclusions} badge={<BadgeCheck width={20} height={20} />} />}
    </Page>
  );
};
