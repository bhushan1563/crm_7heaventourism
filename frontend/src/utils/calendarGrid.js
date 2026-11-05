// The logic of the travel calendar, with no React in it so every rule can be tested: dates as "YYYY-MM-DD" text (so a time zone can never
// move a trip by a day), the grids of the month and week views, how bars of multi-day trips are laid out, the filters, and the .ics file.

// Green is travel (a booked trip), yellow a payment deadline; quotations and inquiries keep their own colours so they are never mistaken for either.
export const KINDS = {
  confirmation: { label: 'Travel (bookings)', one: 'Booking', color: '#12B76A', ink: '#ffffff' },
  payment: { label: 'Payment deadlines', one: 'Payment due', color: '#FACC15', ink: '#422006' },
  quotation: { label: 'Quotations', one: 'Quotation', color: '#2563EB', ink: '#ffffff' },
  guest: { label: 'Inquiries', one: 'Inquiry', color: '#7A5AF8', ink: '#ffffff' }
};
export const KIND_ORDER = ['confirmation', 'payment', 'quotation', 'guest'];
export const VIEWS = [
  { value: 'month', label: 'Month', key: 'm' },
  { value: 'week', label: 'Week', key: 'w' },
  { value: 'day', label: 'Day', key: 'd' },
  { value: 'agenda', label: 'Agenda', key: 'a' }
];
export const AGENDA_DAYS = 90;

const DAY = 86400000;
const stamp = (iso) => Date.parse(`${iso}T00:00:00Z`);

export const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(stamp(v)).toISOString().slice(0, 10) === v;
export const todayIso = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const addDays = (iso, n) => new Date(stamp(iso) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((stamp(b) - stamp(a)) / DAY);
/** 0 = Sunday ... 6 = Saturday */
export const weekday = (iso) => new Date(stamp(iso)).getUTCDay();
export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
export const endOfMonth = (iso) => addDays(addMonths(startOfMonth(iso), 1), -1);
export const startOfWeek = (iso, weekStart = 1) => addDays(iso, -((weekday(iso) - weekStart + 7) % 7));

/** Moves by whole months and keeps the day of the month when it can (31 Jan + 1 month = 28 or 29 Feb). */
export const addMonths = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

const format = (iso, options) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...options }).format(new Date(stamp(iso)));
export const dayNumber = (iso) => Number(iso.slice(8, 10));
export const weekdayName = (iso, style = 'short') => format(iso, { weekday: style });
export const longDate = (iso) => format(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (iso) => format(iso, { day: 'numeric', month: 'short' });
export const fullShortDate = (iso) => format(iso, { day: 'numeric', month: 'short', year: 'numeric' });
export const monthName = (iso) => format(iso, { month: 'long', year: 'numeric' });

export const weekdayHeads = (weekStart = 1) => weekDays('2026-11-04', weekStart).map((d) => weekdayName(d, 'short'));

/** The weeks shown by the month view: each an array of 7 dates, from the week with the 1st to the week with the last day. */
export const monthGrid = (anchor, weekStart = 1) => {
  const first = startOfWeek(startOfMonth(anchor), weekStart);
  const weeks = Math.ceil((daysBetween(first, endOfMonth(anchor)) + 1) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
};
export const weekDays = (anchor, weekStart = 1) => {
  const first = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, d) => addDays(first, d));
};

/** The dates a view needs events for. */
export const viewRange = (view, anchor, weekStart = 1) => {
  if (view === 'month') {
    const grid = monthGrid(anchor, weekStart);
    return { from: grid[0][0], to: grid[grid.length - 1][6] };
  }
  if (view === 'week') {
    const days = weekDays(anchor, weekStart);
    return { from: days[0], to: days[6] };
  }
  if (view === 'day') return { from: anchor, to: anchor };
  return { from: anchor, to: addDays(anchor, AGENDA_DAYS - 1) };
};

export const stepAnchor = (view, anchor, direction) => {
  if (view === 'month') return addMonths(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  if (view === 'day') return addDays(anchor, direction);
  return addDays(anchor, 30 * direction);
};

export const titleOf = (view, anchor, weekStart = 1) => {
  if (view === 'month') return monthName(anchor);
  if (view === 'day') return longDate(anchor);
  const { from, to } = viewRange(view, anchor, weekStart);
  if (view === 'week') return from.slice(0, 7) === to.slice(0, 7) ? `${dayNumber(from)} – ${fullShortDate(to)}` : from.slice(0, 4) === to.slice(0, 4) ? `${shortDate(from)} – ${fullShortDate(to)}` : `${fullShortDate(from)} – ${fullShortDate(to)}`;
  return `${shortDate(from)} – ${fullShortDate(to)}`;
};

// ---- events ----

/** What a trip is called on the calendar: always the guest's name, and for a payment deadline what is still to be paid. */
export const eventLabel = (event) => (event.kind === 'payment' ? `${event.title} · pay ${event.amount || 'balance'}` : event.title);

export const isCancelled = (event) => event.status === 'Cancelled';
export const eventsOnDay = (events, iso) => events.filter((e) => e.start <= iso && e.end >= iso).sort(compareEvents);

export function compareEvents(a, b) {
  return a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title);
}

/** Events that match the chosen kinds, cancelled switch, person and words. `query` may name a client, reference, place, status or team member. */
export const filterEvents = (events, { kinds, showCancelled = false, person = '', query = '' } = {}) => {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return events.filter((e) => {
    if (kinds && !kinds.has(e.kind)) return false;
    if (!showCancelled && isCancelled(e)) return false;
    if (person && e.sales !== person && e.ops !== person) return false;
    if (!words.length) return true;
    const hay = [e.title, e.ref, e.destination, e.status, e.sales, e.ops, e.pax, e.amount, e.supplier, KINDS[e.kind]?.one].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
};

export const peopleOf = (events) => [...new Set(events.flatMap((e) => [e.sales, e.ops]).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/**
 * The bars of one week row. Each trip that touches the week becomes one bar from its first to its last day in the week; bars go into
 * "lanes" so none overlaps another. Only `maxLanes` lanes are drawn; `hidden[i]` counts the trips of day i that did not fit ("+2 more").
 */
export const layoutWeek = (days, events, maxLanes = 3) => {
  const first = days[0];
  const last = days[days.length - 1];
  const touching = events.filter((e) => e.end >= first && e.start <= last).sort(compareEvents);
  const laneEnds = [];
  const placed = [];
  for (const event of touching) {
    const startCol = Math.max(0, daysBetween(first, event.start));
    const endCol = Math.min(days.length - 1, daysBetween(first, event.end));
    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = endCol;
    placed.push({ event, startCol, endCol, lane, continuesBefore: event.start < first, continuesAfter: event.end > last });
  }
  const hidden = days.map(() => 0);
  for (const bar of placed) if (bar.lane >= maxLanes) for (let c = bar.startCol; c <= bar.endCol; c++) hidden[c] += 1;
  return { bars: placed.filter((b) => b.lane < maxLanes), hidden, lanes: Math.min(maxLanes, laneEnds.length) };
};

/** Days (with their events) for the agenda: only the days that have something. */
export const agendaDays = (events, from, to) => {
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const list = eventsOnDay(events, day);
    if (list.length) out.push({ day, events: list });
  }
  return out;
};

// ---- .ics ----

const icsText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (iso) => iso.replace(/-/g, '');
const fold = (line) => {
  const parts = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
};

/** The events as an iCalendar file (every event is an all-day event), that Google Calendar, Outlook and Apple Calendar can import. */
export const buildIcs = (events, now = new Date()) => {
  const stampText = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//7Heaven Tourism//Travel Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:7Heaven travel calendar'];
  for (const e of events) {
    const details = [KINDS[e.kind]?.one, e.ref && `Ref ${e.ref}`, e.amount && `Balance due: ${e.amount}`, e.status && `Status: ${e.status}`, e.pax && `Guests: ${e.pax}`, e.sales && `Sales: ${e.sales}`, e.ops && `Ops: ${e.ops}`].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@7heaven-crm`,
      `DTSTAMP:${stampText}`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(e.end, 1))}`,
      `SUMMARY:${icsText(`${e.kind === 'payment' ? 'Payment due: ' : ''}${e.title}${e.destination ? ` - ${e.destination}` : ''}`)}`,
      ...(e.destination ? [`LOCATION:${icsText(e.destination)}`] : []),
      `DESCRIPTION:${icsText(details)}`,
      ...(isCancelled(e) ? ['STATUS:CANCELLED'] : []),
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
};
