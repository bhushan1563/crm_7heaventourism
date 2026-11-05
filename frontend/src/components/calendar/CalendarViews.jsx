import React from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, ExternalLink, MapPin, Moon, Plane, Trash2, Users, Wallet } from 'lucide-react';
import Modal from '../Modal';
import {
  KINDS, addDays, addMonths, agendaDays, buildIcs, dayNumber, daysBetween, endOfMonth, eventLabel, eventsOnDay, fullShortDate, isCancelled, longDate,
  monthGrid, monthName, shortDate, startOfMonth, weekDays, weekdayHeads, weekdayName
} from '../../utils/calendarGrid';
import { saveBlob } from '../../utils/download';

const colorOf = (event) => KINDS[event.kind]?.color || '#667085';
export const rangeText = (event) => (event.start === event.end ? fullShortDate(event.start) : `${shortDate(event.start)} – ${fullShortDate(event.end)}`);
const tripLength = (event) => daysBetween(event.start, event.end) + 1;
const summary = (event) => [eventLabel(event), event.destination, event.ref].filter(Boolean).join(' · ');
const styleOf = (event) => ({ '--cal': colorOf(event), '--cal-ink': KINDS[event.kind]?.ink || '#ffffff' });

export const KindBadge = ({ event }) => (
  <span className="cal-kind" style={styleOf(event)}>{KINDS[event.kind]?.one}</span>
);

/** One trip as a small block, for the week view and the lists. */
const EventChip = ({ event, day, onOpen }) => {
  const total = tripLength(event);
  return (
    <button type="button" className={`cal-chip${isCancelled(event) ? ' is-cancelled' : ''}`} style={styleOf(event)} onClick={() => onOpen(event)} title={summary(event)}>
      <strong>{eventLabel(event)}</strong>
      {event.destination && <span>{event.destination}</span>}
      {total > 1 && <small>Day {daysBetween(event.start, day) + 1} of {total}</small>}
    </button>
  );
};

/** The month: a row per week, each day cell showing its trips as coloured chips (green = travel, yellow = payment) with the guest name. */
export const MonthView = ({ anchor, events, weekStart, today, onOpen, onDay }) => {
  const weeks = monthGrid(anchor, weekStart);
  const month = anchor.slice(0, 7);
  return (
    <div className="cal-month" aria-label={`Calendar of ${monthName(anchor)}`}>
      <div className="cal-heads">{weekdayHeads(weekStart).map((h) => <div key={h}>{h}</div>)}</div>
      {weeks.map((days) => (
        <div className="cal-week" key={days[0]}>
          {days.map((d) => {
            const list = eventsOnDay(events, d).filter((e) => e.start === d);
            const shown = list.slice(0, 3);
            const extra = list.length - shown.length;
            return (
              <div key={d} className={`cal-day${d.slice(0, 7) !== month ? ' is-other' : ''}${d === today ? ' is-today' : ''}`}>
                <button type="button" className="cal-day-head" onClick={() => onDay(d)} aria-label={`${longDate(d)}, ${list.length ? `${list.length} ${list.length === 1 ? 'trip' : 'trips'}` : 'no trips'}`}>
                  <span className="cal-num">{dayNumber(d)}</span>
                </button>
                {shown.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`cal-pill${isCancelled(e) ? ' is-cancelled' : ''}`}
                    style={styleOf(e)}
                    onClick={() => onOpen(e)}
                    aria-label={`${eventLabel(e)}${e.destination ? ' · ' + e.destination : ''}`}
                    title={`${eventLabel(e)}${e.destination ? ' · ' + e.destination : ''}`}
                  >
                    <span className="cal-pill-type">{e.kind === 'payment' ? 'Payment Deadline' : 'Travel'}</span>
                    <span className="cal-pill-name">{e.title}</span>
                  </button>
                ))}
                {extra > 0 && <button type="button" className="cal-more-btn" onClick={() => onDay(d)}>+{extra} more</button>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** The week: a column per day listing the trips of that day. */
export const WeekView = ({ anchor, events, weekStart, today, onOpen, onDay }) => (
  <div className="cal-weekview">
    {weekDays(anchor, weekStart).map((d) => {
      const list = eventsOnDay(events, d);
      return (
        <section key={d} className={`cal-col${d === today ? ' is-today' : ''}`} aria-label={longDate(d)}>
          <button type="button" className="cal-col-head" onClick={() => onDay(d)}>
            <span>{weekdayName(d)}</span>
            <strong>{dayNumber(d)}</strong>
          </button>
          <div className="cal-col-body">
            {list.length ? list.map((e) => <EventChip key={e.id} event={e} day={d} onOpen={onOpen} />) : <span className="cal-empty-day">No trips</span>}
          </div>
        </section>
      );
    })}
  </div>
);

const Facts = ({ event }) => (
  <>
    <div className="cal-facts">
      <span><CalendarPlus size={13} aria-hidden="true" /> {rangeText(event)}</span>
      {event.nights > 0 && <span><Moon size={13} aria-hidden="true" /> {event.nights} {event.nights === 1 ? 'night' : 'nights'}</span>}
      {event.destination && <span><MapPin size={13} aria-hidden="true" /> {event.destination}</span>}
      {event.pax && <span><Users size={13} aria-hidden="true" /> {event.pax}</span>}
      {event.amount && <span><Wallet size={13} aria-hidden="true" /> {event.amount} to pay</span>}
      {event.kind === 'payment' && event.travelStart && <span><Plane size={13} aria-hidden="true" /> Travels {fullShortDate(event.travelStart)}</span>}
    </div>
  </>
);

/** One day in full. */
export const DayView = ({ anchor, events, onOpen }) => {
  const list = eventsOnDay(events, anchor);
  if (!list.length) return <div className="cal-state"><p>Nothing travels on {longDate(anchor)}.</p></div>;
  return (
    <div className="cal-daylist">
      {list.map((e) => (
        <button key={e.id} type="button" className={`cal-card${isCancelled(e) ? ' is-cancelled' : ''}`} style={styleOf(e)} onClick={() => onOpen(e)}>
          <div className="cal-card-top">
            <strong>{eventLabel(e)}</strong>
            <KindBadge event={e} />
            {e.status && <span className="cal-status">{e.status}</span>}
          </div>
          <Facts event={e} />
          <div className="cal-card-foot">
            {e.ref && <span>{e.ref}</span>}
            {tripLength(e) > 1 && <span>Day {daysBetween(e.start, anchor) + 1} of {tripLength(e)}</span>}
            {(e.sales || e.ops) && <span>{[e.sales && `Sales: ${e.sales}`, e.ops && `Ops: ${e.ops}`].filter(Boolean).join('  ·  ')}</span>}
          </div>
        </button>
      ))}
    </div>
  );
};

/** The coming days that have trips, one after the other. */
export const AgendaView = ({ anchor, events, range, today, onOpen }) => {
  const days = agendaDays(events, range.from, range.to);
  if (!days.length) return <div className="cal-state"><p>No trips from {fullShortDate(range.from)} to {fullShortDate(range.to)}.</p></div>;
  return (
    <div className="cal-agenda">
      {days.map(({ day, events: list }) => (
        <section key={day} className="cal-agenda-day" aria-label={longDate(day)}>
          <h3 className={day === today ? 'is-today' : ''}><strong>{dayNumber(day)}</strong> <span>{weekdayName(day, 'long')}, {monthName(day)}</span>{day === today && <em>Today</em>}</h3>
          <div className="cal-agenda-rows">
            {list.map((e) => (
              <button key={e.id} type="button" className={`cal-row${isCancelled(e) ? ' is-cancelled' : ''}`} style={styleOf(e)} onClick={() => onOpen(e)}>
                <span className="cal-dot" aria-hidden="true" />
                <strong>{eventLabel(e)}</strong>
                <span className="cal-row-where">{e.destination}</span>
                <span className="cal-row-range">{e.kind === 'payment' ? `Deadline${e.travelStart ? ` · travels ${fullShortDate(e.travelStart)}` : ''}` : e.start === e.end ? 'All day' : `${rangeText(e)}${e.start < day ? ` (day ${daysBetween(e.start, day) + 1})` : ''}`}</span>
                <KindBadge event={e} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

/** A small month for jumping about, with a dot on the days that have trips. */
export const MiniMonth = ({ cursor, onCursor, anchor, today, weekStart, events, onPick }) => {
  const weeks = monthGrid(cursor, weekStart);
  const month = cursor.slice(0, 7);
  const busy = new Set();
  for (const e of events) for (let d = e.start; d <= e.end && daysBetween(e.start, d) < 120; d = addDays(d, 1)) busy.add(d);
  return (
    <div className="cal-mini">
      <div className="cal-mini-head">
        <strong>{monthName(cursor)}</strong>
        <span>
          <button type="button" className="btn-icon" onClick={() => onCursor(addMonths(startOfMonth(cursor), -1))} aria-label="Small calendar: previous month"><ChevronLeft size={15} /></button>
          <button type="button" className="btn-icon" onClick={() => onCursor(addMonths(startOfMonth(cursor), 1))} aria-label="Small calendar: next month"><ChevronRight size={15} /></button>
        </span>
      </div>
      <div className="cal-mini-grid">
        {weekdayHeads(weekStart).map((h) => <span key={h} className="cal-mini-h">{h[0]}</span>)}
        {weeks.flat().map((d) => (
          <button key={d} type="button" className={`cal-mini-d${d.slice(0, 7) !== month ? ' is-other' : ''}${d === today ? ' is-today' : ''}${d === anchor ? ' is-picked' : ''}${busy.has(d) ? ' has-trip' : ''}`} onClick={() => onPick(d)} aria-label={longDate(d)} aria-pressed={d === anchor}>
            {dayNumber(d)}
          </button>
        ))}
      </div>
    </div>
  );
};

const googleLink = (e) => {
  const flat = (iso) => iso.replace(/-/g, '');
  const details = [KINDS[e.kind]?.one, e.ref && `Ref ${e.ref}`, e.amount && `Balance due: ${e.amount}`, e.status && `Status: ${e.status}`, e.pax && `Guests: ${e.pax}`, e.sales && `Sales: ${e.sales}`, e.ops && `Ops: ${e.ops}`].filter(Boolean).join('\n');
  const params = new URLSearchParams({ action: 'TEMPLATE', text: `${e.kind === 'payment' ? 'Payment due: ' : ''}${e.title}${e.destination ? ` - ${e.destination}` : ''}`, dates: `${flat(e.start)}/${flat(addDays(e.end, 1))}`, details, location: e.destination || '' });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/** Everything about one trip, with a way into its record, to Google Calendar, and to an .ics file. */
export const EventDialog = ({ event, onClose, onGo, onDelete }) => {
  if (!event) return null;
  const rows = [
    ['Type', KINDS[event.kind]?.one + (event.type ? ` (${event.type})` : '')],
    ['Reference', event.ref],
    ['Status', event.status],
    [event.kind === 'payment' ? 'Payment due on' : 'Travel dates', rangeText(event)],
    ['Balance to pay', event.amount],
    ['Travels on', event.kind === 'payment' && event.travelStart ? fullShortDate(event.travelStart) : ''],
    ['Nights', event.nights > 0 ? String(event.nights) : ''],
    ['Destination', event.destination],
    ['Guests', event.pax],
    ['Sales', event.sales],
    ['Operations', event.ops]
  ].filter(([, v]) => v);
  return (
    <Modal isOpen onClose={onClose} title={event.title} subtitle={`${KINDS[event.kind]?.one}${event.ref ? ` · ${event.ref}` : ''}`} maxWidth="520px">
      <p className="cal-guest" style={styleOf(event)}><span className="cal-dot" aria-hidden="true" /> {eventLabel(event)}</p>
      <dl className="cal-detail">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="cal-detail-actions">
        {event.isManual
          ? <button type="button" className="btn btn-danger" onClick={() => onDelete(event)}><Trash2 size={15} /> Delete event</button>
          : <button type="button" className="btn btn-primary" onClick={() => onGo(event)}><ExternalLink size={15} /> Open {event.kind === 'payment' ? 'booking' : KINDS[event.kind]?.one.toLowerCase()}</button>
        }
        <a className="btn btn-outline" href={googleLink(event)} target="_blank" rel="noopener noreferrer"><CalendarPlus size={15} /> Add to Google Calendar</a>
        <button type="button" className="btn btn-outline" onClick={() => saveBlob(new Blob([buildIcs([event])], { type: 'text/calendar;charset=utf-8' }), `${(event.ref || event.title).replace(/[^a-zA-Z0-9-]+/g, '_')}.ics`)}><Download size={15} /> Download .ics</button>
      </div>
    </Modal>
  );
};

export { endOfMonth };
