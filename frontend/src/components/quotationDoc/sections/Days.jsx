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

/** A day of the itinerary: the band (ribbon, date, title, where the night is spent), then what happens, and the notes that belong to it. */
export const DayCard = ({ day, index, total, model, quotation }) => {
  const parsed = parseDay(day.description);
  const Art = iconForDay(`${day.title} ${parsed.summary}`, index);
  const date = dayDate(model, index);
  const rows = parsed.rows.slice();
  if (day.meals && !rows.some((r) => /meal/i.test(r.label))) rows.push({ label: 'Meals', items: [day.meals] });
  const last = index === total - 1;
  const stay = overnightOf(quotation, model.start, index);
  const heading = `Day ${index + 1}${date ? ` – ${weekday(date)}, ${longDate(date)}` : ''}`;
  return (
    <div className="quotation-keep qd-day" data-day={index + 1} data-section={index === 0 ? 'days' : undefined}>
      <div className="qd-day-band">
        <div className="qd-day-ribbon">
          <div className="body"><div className="d">DAY</div><div className="n">{pad2(index + 1)}</div><div className="lo"><IconLotus size={15} color="#ffffff" accent="#ffffff" /></div></div>
          <div className="tip" />
        </div>
        <div className="qd-day-head">
          <div className="dt">{heading}</div>
          <div className="ti">{day.title || 'Sightseeing & Excursions'}</div>
          {parsed.summary && <div className="su"><RichLine html={parsed.summary} /></div>}
        </div>
        {(stay || last) && (
          <div className="qd-day-over">
            <div className="k">{stay ? 'Overnight' : 'Trip ends'}</div>
            <div className="v">{stay || 'Departure'}</div>
          </div>
        )}
      </div>
      <div className="qd-day-body">
        <div className="qd-day-art"><Art size={60} /></div>
        <div className="qd-day-rows">
          {rows.length ? rows.map((row, i) => <Row key={i} row={row} />) : <div className="qd-day-row nolabel"><div className="bl"><ul><li>Details of this day will be shared on confirmation.</li></ul></div></div>}
          {day.photos?.length > 0 && <div className="qd-day-photos"><DayPhotos photos={day.photos} maxRowHeight={420} /></div>}
        </div>
      </div>
      {parsed.callouts.map((c, i) => (
        <div className="qd-callout" key={`c${i}`}>
          <span className="ic"><ShieldAlert size={42} /></span>
          <div><div className="ti">{c.title}</div><div className="tx"><RichLine html={c.html} /></div></div>
        </div>
      ))}
      {parsed.why && (
        <div className="qd-why"><span className="k">Why this day</span><span className="t"><RichLine html={parsed.why} /></span></div>
      )}
    </div>
  );
};

/** The day-by-day pages: the day cards flow one after the other; the PDF starts a new sheet when one is full. */
export const DaysPage = ({ model, quotation, id }) => {
  const days = quotation.itinerary || [];
  return (
    <Page id={id} model={model} header="Day-by-Day Itinerary" flowClass="qd-days-flow">
      {days.map((day, i) => <DayCard key={i} day={day} index={i} total={days.length} model={model} quotation={quotation} />)}
      <div className="quotation-keep qd-end"><RichLine html={quotation.endOfTourNote || '***End of the Tour***'} /></div>
    </Page>
  );
};
