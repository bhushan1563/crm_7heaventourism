import React from 'react';
import logoImg from '../../assets/logo.webp';
import { mediaUrl } from '../../services/mediaService';
import { API_ORIGIN } from '../../services/api';
import { Frame } from './PageParts';
import { IconTagSmall, IconUsers, SkylineGeneric } from './art';
import { headerTagline } from '../../utils/companyHeader';
import { formatLongDate } from '../../utils/dateHelper';
import { pad2, plural } from './model';

const photoCrossOrigin = API_ORIGIN ? 'anonymous' : undefined;

/** The picture on the cover: the one chosen for it, else the first photo the quotation has (a day's, else a hotel's). Nothing when there is none. */
export const coverPhotoOf = (quotation) => {
  if (quotation.coverPhoto && typeof quotation.coverPhoto.token === 'string') return quotation.coverPhoto;
  const days = (quotation.itinerary || []).flatMap((d) => d.photos || []);
  const stays = [...(quotation.packageDetails?.hotels || []), ...(quotation.options || []).flatMap((o) => o.hotels || [])].flatMap((h) => h.photos || []);
  return [...days, ...stays].find((p) => p && typeof p.token === 'string') || null;
};

/** The size of the destination on the cover: the shorter the name, the larger it is set. */
export const titleSize = (text) => {
  const n = String(text || '').length;
  if (n <= 7) return 82;
  if (n <= 10) return 62;
  if (n <= 14) return 50;
  if (n <= 20) return 40;
  return 32;
};

const breakfast = (hotels) => hotels.length > 0 && hotels.every((h) => /breakfast|\bcp\b|\bmap\b|\bap\b/i.test(String(h.mealPlan || '')));

/** Up to four facts under the cover card, each a number and a line about it; the last is always the round-the-clock assistance. */
export const coverStats = (model, quotation) => {
  const stats = [];
  const { type, nights, days, stops, hotels, stars, place } = model;
  const push = (n, label) => stats.push({ n: typeof n === 'number' ? pad2(n) : n, label });
  if (type === 'Visa') {
    const v = quotation.visa || {};
    if (v.applicants) push(Number(v.applicants), `Applicant${Number(v.applicants) === 1 ? '' : 's'} on this application`);
    if (v.processingTime) push(String(v.processingTime).replace(/\s*(working\s*)?days?\s*$/i, '') || '—', 'Processing time (days)');
    push('24/7', 'Guidance until your visa is in hand');
  } else if (type === 'Land Service') {
    if (days) push(days, `Day${days === 1 ? '' : 's'} of service`);
    const count = (quotation.vehicles || []).reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
    if (count) push(count, `Private vehicle${count === 1 ? '' : 's'} for your party`);
    push('24/7', 'Assistance from your coordinator');
  } else if (type === 'Only Hotel') {
    if (nights) push(nights, stars ? `Night${nights === 1 ? '' : 's'} of ${stars}★ stay` : `Night${nights === 1 ? '' : 's'} of stay`);
    if (hotels.length) push(hotels.length, hotels.length === 1 ? 'Hotel, carefully chosen' : 'Hotels, carefully chosen');
    if (breakfast(hotels)) push('✓', 'Daily breakfast included');
    push('24/7', 'Support before and during your stay');
  } else {
    if (nights) push(nights, stars ? `Night${nights === 1 ? '' : 's'} of ${stars}★ stay${breakfast(hotels) ? ' with daily breakfast' : ''}` : `Night${nights === 1 ? '' : 's'} of comfortable stay`);
    if (days) push(days, `Day${days === 1 ? '' : 's'} planned in detail`);
    if (stops.length) push(stops.length, stops.length === 1 ? 'Destination on your route' : 'Destinations on your route');
    push('24/7', place ? `On-ground assistance in ${place}` : 'On-ground assistance');
  }
  return stats.slice(0, 4);
};

const lengthText = (model, quotation) => {
  if (model.type === 'Visa') return 'Visa Services';
  const { nights, days } = model;
  if (nights && days) return `${plural(nights, 'Night')}  •  ${plural(days, 'Day')}`;
  if (days) return plural(days, 'Day');
  return model.type === 'Only Hotel' ? 'Hotel Stay' : 'Tailor-made Journey';
};

/** The first page: the company, the picture, the destination, the trip at a glance, who it is for and what comes with it. */
export const Cover = ({ model, quotation, id }) => {
  const photo = coverPhotoOf(quotation);
  const company = model.company;
  const stats = coverStats(model, quotation);
  const tagline = [company.tagline, model.locality].filter(Boolean).join('  ·  ');
  const place = model.place || 'Your Journey';
  const contact = [company.phone, model.locality].filter(Boolean).join('  ·  ');
  const pills = [
    model.type === 'Visa' ? ['Applicants', String(quotation.visa?.applicants || 1)] : ['Travellers', model.travellers],
    [model.confirmation ? 'Booking No' : 'Trip ID', model.tripId]
  ].filter(([, v]) => v);
  return (
    <div className="quotation-page qd-page qd-cover is-fixed" id={id} data-qd-page="" data-qd-cover="">
      <Frame cover />
      <div className="abs brand">{model.brand}</div>
      <div className="abs sub">{tagline}</div>
      <div className="abs flour" />

      <div className="abs photo">
        {photo ? (
          <div className="dome">
            <img src={mediaUrl(photo.token)} alt="" crossOrigin={photoCrossOrigin} style={{ position: 'absolute', left: 185, top: -15, width: 658, height: 454, objectFit: 'cover', display: 'block' }} />
          </div>
        ) : (
          <div className="dome" style={{ background: 'linear-gradient(180deg, #123456 0%, #0d2d4c 55%, #0a2742 100%)' }}>
            <div style={{ position: 'absolute', left: 234, top: 62, width: 560 }}><SkylineGeneric variant="cover" width={560} height={130} style={{ opacity: 0.7 }} /></div>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,39,66,0.35) 0%, rgba(10,39,66,0.08) 22%, rgba(10,39,66,0.3) 38%, rgba(10,39,66,0.66) 55%, rgba(10,39,66,0.86) 75%, rgba(10,39,66,0.95) 90%, #0a2742 100%)' }} />
        <svg className="edge" width="658" height="454" viewBox="0 0 658 454" aria-hidden="true"><path d="M12 454V138A503 503 0 0 1 646 138V454" fill="none" stroke="#e6cb7e" strokeWidth="1.1" opacity="0.8" /></svg>
      </div>
      <div className="abs logo"><img src={company.logo || logoImg} alt="" crossOrigin={company.logo ? photoCrossOrigin : undefined} /></div>

      <div className="abs titleblock">
        <div className="kicker">{model.kicker}</div>
        <div className="title" style={{ fontSize: `${titleSize(place)}px` }}>{place}</div>
        {model.country && <div className="country">{model.country}</div>}
      </div>

      <div className="abs card-wrap">
        <div className="card">
          <div className="len">{lengthText(model, quotation)}</div>
          {model.dateRange && <div className="dates">{model.dateRange}</div>}
          <div className="pills">
            {pills.map(([label, value]) => (
              <span className="pill" key={label}>
                {label !== 'Travellers' && label !== 'Applicants' ? <IconTagSmall width={11} height={11} /> : <IconUsers width={12} height={10} />}
                <b>{label}</b> {value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {quotation.confirmationInfo && (
        <div className="abs caption" data-testid="confirmation-line">
          <span style={quotation.confirmationInfo.status === 'Cancelled' ? { color: '#f3a6a6' } : undefined}>
            Confirmation Details: {quotation.confirmationInfo.no}{quotation.confirmationInfo.confirmedAt ? ` • Confirmed on ${formatLongDate(quotation.confirmationInfo.confirmedAt)}` : ''}{quotation.confirmationInfo.status === 'Cancelled' ? ' • CANCELLED' : ''}
          </span>
        </div>
      )}
      <div className="abs rule" style={{ top: 684 }} />
      <div className="abs prep">
        <div>
          <div className="k">Prepared exclusively for</div>
          <div className="v">{model.guest}</div>
          {model.travellers && <div className="d">{model.travellers.replace(/\s*\+\s*/g, ' & ')}</div>}
        </div>
        <div>
          <div className="k">Prepared by</div>
          <div className="v">{company.name}</div>
          {contact && <div className="d">{contact}</div>}
        </div>
      </div>
      <div className="abs rule" style={{ top: 766 }} />

      <div className="abs stats">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="n">{s.n}</div>
            <div className="l">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** The last page: a thank-you, the company's details and the trip number, over the same scene as the welcome page. */
export const BackCover = ({ model, id }) => {
  const c = model.company;
  const addressParts = String(c.address || '').split(',').map((s) => s.trim()).filter(Boolean);
  const total = addressParts.join(', ').length;
  let at = 0;
  let run = 0;
  while (at < addressParts.length - 1 && run + addressParts[at].length < total / 2) { run += addressParts[at].length + 2; at += 1; }
  const line1 = addressParts.slice(0, at + 1).join(', ');
  const line2 = addressParts.slice(at + 1).join(', ');
  const web = String(c.website || '').replace(/^https?:\/\//, '');
  return (
    <div className="quotation-page qd-page qd-cover qd-back is-fixed" id={id} data-qd-page="" data-qd-back="">
      <Frame cover />
      <div className="abs scene"><SkylineGeneric variant="cover" width={660} height={153} style={{ opacity: 0.8 }} /></div>
      <div className="abs scene-cap">Until we meet again</div>
      <div className="abs thanks">
        <div className="lotus"><span /><i /><span /></div>
        <div className="k">Thank you for choosing</div>
        <div className="nm">{model.brand}</div>
        {c.tagline && <div className="tg">{c.tagline}</div>}
        <div className="pt">★ {headerTagline(c.description, model.confirmation)} ★</div>
        <div className="dv"><span /><i /><span /></div>
        <div className="addr">{line1 && <div>{line1}</div>}{line2 && <div>{line2}</div>}</div>
        {(c.phone || c.email) && <div className="reach">{c.phone}{c.phone && c.email && <i />}{c.email}</div>}
        {web && <div className="web">{web}</div>}
        {model.tripId && <div className="web id">{model.confirmation ? 'Booking No' : 'Trip ID'} {model.tripId}</div>}
      </div>
    </div>
  );
};
