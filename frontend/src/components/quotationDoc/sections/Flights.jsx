import React from 'react';
import { IntroBand, Page, RichLine } from '../PageParts';
import { BannerBoat, IconPlane } from '../art';
import { mediaUrl } from '../../../services/mediaService';
import { API_ORIGIN } from '../../../services/api';
import { formatDate } from '../../../utils/dateHelper';

const crossOrigin = API_ORIGIN ? 'anonymous' : undefined;

const Segment = ({ f, quotation }) => (
  <div className="quotation-keep qd-flight">
    <div className="hd">
      <span><b>{f.flightType || 'Departure'}</b>: {f.departureDate ? formatDate(f.departureDate) : f.depDate ? formatDate(f.depDate) : quotation.travelDate ? formatDate(quotation.travelDate) : 'As confirmed'}</span>
      <span className="rt">{f.route || `${f.fromAirport || 'Origin'} → ${f.toAirport || 'Destination'}`}</span>
      <span>{f.cabinClass || 'Economy - Normal'}</span>
    </div>
    <div className="grid">
      <div><div className="al">{f.airline || 'Indigo'}</div><div className="fn">{f.flightNumber || '6E 6805'}</div></div>
      <div><div className="ap">{f.fromAirport || 'Origin Airport'}</div><div className="tm">{f.depTime || '11:20'}</div></div>
      <div className="mid">
        <div>{f.duration || 'Direct'}</div>
        <div className="bar"><i /><IconPlane size={13} /><i /></div>
        <div className="st">{f.flightStop || 'Non-stop'}</div>
      </div>
      <div><div className="ap">{f.toAirport || 'Destination Airport'}</div><div className="tm">{f.arrTime || '13:10'}</div></div>
    </div>
    <div className="bg"><span>Check-in: <b>{f.baggageCheckIn || '15 kg'}</b></span><span>Cabin: <b>{f.baggageCabin || '7 kg'}</b></span></div>
  </div>
);

/** "Flight Details": screenshots of the ticket, a note that the details follow the issued ticket, or a card for each flight. */
export const FlightsPage = ({ model, quotation, numeral, id }) => {
  const images = quotation.flightImages || [];
  const segments = quotation.flightDetails || [];
  return (
    <Page id={id} model={model} header="Flight Details">
      <IntroBand numeral={numeral} title="Flight Details" text="How you travel to and from your destination." art={<BannerBoat size={52} />} section="flights" />
      {images.map((photo) => (
        <figure key={photo.token} className="quotation-keep qd-shot">
          <img src={mediaUrl(photo.token)} alt={photo.caption || 'Flight details'} width={photo.width} height={photo.height} crossOrigin={crossOrigin} />
          {photo.caption && <figcaption>{photo.caption}</figcaption>}
        </figure>
      ))}
      {quotation.asPerFlightTicket ? (
        <div className="quotation-keep qd-ticket">
          <b>Flight details will be as per confirmed flight ticket</b>
          <div className="tx"><RichLine html={quotation.flightTicketNote || 'Official airline PNR and flight e-tickets will be issued & shared upon final booking confirmation.'} /></div>
          {quotation.flightTicketUrl && <div className="tx" style={{ color: '#0b7480', fontWeight: 600 }}>📎 Attached E-Ticket: <span style={{ textDecoration: 'underline' }}>{quotation.flightTicketUrl}</span></div>}
        </div>
      ) : (
        segments.map((f, i) => <Segment key={i} f={f} quotation={quotation} />)
      )}
    </Page>
  );
};
