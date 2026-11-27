import React from 'react';
import { Page, RichLine } from '../PageParts';
import { DayPhotos } from '../DayPhotos';
import { IconLotus, ShieldAlert } from '../art';
import { iconForDay, iconForLabel } from '../iconMap';
import { dayDate, longDate, overnightOf, pad2, parseDay, weekday } from '../model';
import { richToPlainText } from '../../../utils/richText';

const isShort = (html) => richToPlainText(html).length <= 34;

/** One row of a day: a label with its small drawing, and the bullets (two columns when there are many short ones). */
const Row = ({ row }) => {
  const Icon = row.label ? iconForLabel(row.label) : null;
  const two = row.items.length >= 4 && row.items.every(isShort);
  return (
    <div className={`qd-day-row${row.label ? '' : ' nolabel'}`}>
      {row.label && <div className="lb"><Icon size={13} /><span>{row.label}</span></div>}
      <div className="bl">
        <ul className={two ? 'two' : undefined}>{row.items.map((item, i) => <li key={i}><RichLine html={item} /></li>)}</ul>
      </div>
    </div>
  );
};

/**
 * A day of the itinerary: the band (ribbon, date, title, where the night is spent), then what happens, and the notes that belong to it.
 * It is drawn as pieces (the band with the first rows, each further row, the photos, each note), so a long day continues on the next page
 * instead of moving over whole and leaving the page before it half empty.
 */
export const DayCard = ({ day, index, total, model, quotation, endNote = '' }) => {
  const parsed = parseDay(day.description);
  const Art = iconForDay(`${day.title} ${parsed.summary}`, index);
  const date = dayDate(model, index);
  const rows = parsed.rows.slice();
  if (day.meals && !rows.some((r) => /meal/i.test(r.label))) rows.push({ label: 'Meals', items: [day.meals] });
  const last = index === total - 1;
  const stay = overnightOf(quotation, model.start, index);
  const heading = `Day ${index + 1}${date ? ` – ${weekday(date)}, ${longDate(date)}` : ''}`;
  const under = parsed.summary || parsed.distance;

  const body = (content, art = null) => (
    <div className="qd-day-body">
      <div className="qd-day-art">{art}</div>
      <div className="qd-day-rows">{content}</div>
    </div>
  );
  const first = rows.length ? rows.slice(0, 2).map((row, i) => <Row key={i} row={row} />) : <div className="qd-day-row nolabel"><div className="bl"><ul><li>Details of this day will be shared on confirmation.</li></ul></div></div>;
  const pieces = [
    <>
      <div className="qd-day-band">
        <div className="qd-day-ribbon">
          <div className="body"><div className="d">DAY</div><div className="n">{pad2(index + 1)}</div><div className="lo"><IconLotus size={15} color="#ffffff" accent="#ffffff" /></div></div>
          <div className="tip" />
        </div>
        <div className="qd-day-head">
          <div className="dt">{heading}</div>
          <div className="ti">{day.title || 'Sightseeing & Excursions'}</div>
          {under && <div className="su"><RichLine html={under} /></div>}
        </div>
        {(stay || last) && (
          <div className="qd-day-over">
            <div className="k">{stay ? 'Overnight' : 'Trip ends'}</div>
            <div className="v">{stay || 'Departure'}</div>
          </div>
        )}
      </div>
      {body(first, <Art size={52} />)}
    </>,
    ...rows.slice(2).map((row) => body(<Row row={row} />)),
    ...(day.photos?.length ? [body(<div className="qd-day-photos"><DayPhotos photos={day.photos} maxRowHeight={170} /></div>)] : []),
    ...parsed.callouts.map((c) => (
      <div className="qd-callout">
        <span className="ic"><ShieldAlert size={42} /></span>
        <div><div className="ti">{c.title}</div><div className="tx"><RichLine html={c.html} /></div></div>
      </div>
    )),
    ...(parsed.why ? [<div className="qd-why"><span className="k">Why this day</span><span className="t"><RichLine html={parsed.why} /></span></div>] : [])
  ];

  return (
    <div className="qd-day">
      {pieces.map((piece, i) => (
        <div key={i} className={`quotation-keep qd-daypart${i === 0 ? ' is-head' : ''}`} data-day={i === 0 ? index + 1 : undefined} data-section={index === 0 && i === 0 ? 'days' : undefined}>
          {piece}
          {endNote && i === pieces.length - 1 && <div className="qd-end"><RichLine html={endNote} /></div>}
        </div>
      ))}
    </div>
  );
};

/** The day-by-day pages: the day cards flow one after the other; the PDF starts a new sheet when one is full. */
export const DaysPage = ({ model, quotation, id }) => {
  const days = quotation.itinerary || [];
  return (
    <Page id={id} model={model} header="Day-by-Day Itinerary" flowClass="qd-days-flow">
      {/* The end-of-tour line is part of the last day, so it can never be left alone on a page of its own. */}
      {days.map((day, i) => <DayCard key={i} day={day} index={i} total={days.length} model={model} quotation={quotation} endNote={i === days.length - 1 ? quotation.endOfTourNote || '***End of the Tour***' : ''} />)}
    </Page>
  );
};
