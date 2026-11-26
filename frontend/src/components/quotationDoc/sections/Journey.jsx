import React from 'react';
import { IntroBand, Page, SectionBanner } from '../PageParts';
import { BannerBoat, Compass, IconBedRing, IconInfoRing } from '../art';
import { dayBlurb, dayDate, overnightOf, overviewRows, parseDay, shortDayMonth, weekday } from '../model';
import { richToPlainText } from '../../../utils/richText';

const mapsUrl = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** The stops of the trip joined by a dashed line, in rows of up to four, each with its number and its nights. */
const Route = ({ stops }) => {
  const perRow = stops.length <= 6 ? Math.max(stops.length, 4) : 5; // up to six stops stay on one line
  const rows = [];
  for (let i = 0; i < stops.length; i += perRow) rows.push(stops.slice(i, i + perRow));
  let n = 0;
  return (
    <div className="quotation-keep qd-route">
      <div className="qd-route-in">
        <div className="cap">Your route</div>
        <span className="compass"><Compass width={44} height={44} /></span>
        {rows.map((row, r) => (
          <div className="row" key={r}>
            {row.map((stop, k) => {
              n += 1;
              return (
                <div className="qd-stop" key={`${stop.name}-${k}`} style={{ flexBasis: `${100 / perRow}%` }}>
                  {k < row.length - 1 && <span className="ln" />}
                  <div className="dot">{n}</div>
                  <div className="nm">{stop.name}</div>
                  <div className="nt">{stop.nights} {stop.nights === 1 ? 'night' : 'nights'}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/** "The Journey": where you go and stay (a route), then a table of the hotel stays. */
export const JourneyPage = ({ model, quotation, numeral, id }) => {
  const rows = (quotation.options || []).length ? [] : overviewRows(quotation);
  const roomInfo = richToPlainText(quotation.packageDetails?.roomInfo || '').trim();
  const lead = model.days > 1 ? `Every place you will visit across the ${model.days} days, and the nights you spend in each.` : 'Where you go, and where you stay.';
  return (
    <Page id={id} model={model} header="The Journey">
      <IntroBand numeral={numeral} title="The Journey" text={lead} art={<BannerBoat width={51} height={33} />} section="journey" />
      {model.stops.length > 0 && <Route stops={model.stops} />}
      {rows.length > 0 && (
        <>
          <SectionBanner tight>Trip Overview</SectionBanner>
          <table className="quotation-keep qd-table qd-overview">
            <thead><tr><th style={{ width: '22%' }}>Date</th><th style={{ width: '20%' }}>Destination</th><th>Hotel</th><th style={{ width: '17%' }}>Meal Plan</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{r.when}</td><td className="c">{r.where}</td><td>{r.hotel}</td><td className="c">{r.meals}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {roomInfo && <div className="quotation-keep qd-facts"><span className="ic"><IconBedRing width={21} height={21} /></span><span><b>Accommodation</b> — {roomInfo}</span></div>}
      {rows.length > 0 && <div className="quotation-keep qd-facts"><span className="ic"><IconInfoRing width={21} height={21} /></span><span><b>Please note</b> — Hotel accommodation is subject to final confirmation and availability.</span></div>}
    </Page>
  );
};

/** "The Shape of the Journey": one line for each day, with its date, its place, a few words and where the night is spent. */
export const ShapePage = ({ model, quotation, id }) => {
  const days = quotation.itinerary || [];
  return (
    <Page id={id} model={model} header="The Journey">
      <SectionBanner>The Shape of the Journey</SectionBanner>
      {days.map((day, i) => {
        const date = dayDate(model, i);
        const blurb = dayBlurb(parseDay(day.description));
        const overnight = overnightOf(quotation, model.start, i);
        return (
          <div className={`quotation-keep qd-shape${i === days.length - 1 ? ' last' : ''}`} key={i} data-section={i === 0 ? 'shape' : undefined}>
            <div className="rail"><div className="circle">{String(i + 1).padStart(2, '0')}</div><div className="dash" /></div>
            <div className="card">
              <div className="main">
                <div>
                  {date && <span className="when">{`${weekday(date).slice(0, 3)} ${shortDayMonth(date)}`}</span>}
                  <span className="place">{day.title || `Day ${i + 1}`}</span>
                </div>
                {blurb && <div className="blurb">{blurb}</div>}
              </div>
              <div className="night">{overnight || i < days.length - 1 ? 'Night' : 'Trip ends'}<b>{overnight || (i < days.length - 1 ? '—' : 'Departure')}</b></div>
              <a className="map" href={mapsUrl(`${day.title || overnight || ''} ${model.place}`.trim())} target="_blank" rel="noopener noreferrer">LOCATION ↗</a>
            </div>
          </div>
        );
      })}
    </Page>
  );
};
