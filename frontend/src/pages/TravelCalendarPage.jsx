import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search } from 'lucide-react';
import calendarService from '../services/calendarService';
import { getErrorMessage } from '../services/api';
import { saveBlob } from '../utils/download';
import {
  KINDS, KIND_ORDER, VIEWS, buildIcs, filterEvents, isIso, peopleOf, startOfMonth, stepAnchor, titleOf, todayIso, viewRange
} from '../utils/calendarGrid';
import { AgendaView, DayView, EventDialog, MiniMonth, MonthView, WeekView } from '../components/calendar/CalendarViews';
import './itineraries.css';
import '../components/calendar/calendar.css';

const STORE = 'crm.calendar';
const read = () => {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) || '{}') || {};
  } catch {
    return {};
  }
};
const write = (patch) => {
  try {
    window.localStorage.setItem(STORE, JSON.stringify({ ...read(), ...patch }));
  } catch { /* the page works without remembering */ }
};
const ALL_KINDS = KIND_ORDER;

const typing = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** The travel calendar: every trip that has a travel date (inquiries, quotations, bookings), as in Google Calendar: month, week, day and agenda. */
export const TravelCalendarPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const saved = useMemo(read, []);

  const view = VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : saved.view || (window.innerWidth < 700 ? 'agenda' : 'month');
  const anchor = isIso(params.get('date')) ? params.get('date') : today;
  const [weekStart, setWeekStart] = useState(saved.weekStart === 0 ? 0 : 1);
  const [kinds, setKinds] = useState(() => new Set(Array.isArray(saved.kinds) ? saved.kinds.filter((k) => ALL_KINDS.includes(k)) : ALL_KINDS));
  const [showCancelled, setShowCancelled] = useState(Boolean(saved.showCancelled));
  const [person, setPerson] = useState('');
  const [query, setQuery] = useState('');
  const [mini, setMini] = useState(startOfMonth(anchor));
  const [data, setData] = useState({ events: [], sources: { guests: true, quotations: true, confirmations: true } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(null);
  const searchRef = useRef(null);
  const latest = useRef(0);

  const range = useMemo(() => viewRange(view, anchor, weekStart), [view, anchor, weekStart]);

  const go = useCallback((patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  }, [params, setParams]);
  const setView = (value) => {
    write({ view: value });
    go({ view: value });
  };
  const setAnchor = (date) => {
    setMini(startOfMonth(date));
    go({ date });
  };

  const load = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const res = await calendarService.get(range.from, range.to);
      if (request !== latest.current) return;
      if (res.success) setData({ events: res.data, sources: res.sources || data.sources });
      else setError(res.message || 'The calendar could not be loaded.');
    } catch (err) {
      if (request === latest.current) setError(getErrorMessage(err, 'The calendar could not be loaded.'));
    } finally {
      if (request === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => filterEvents(data.events, { kinds, showCancelled, person, query }), [data.events, kinds, showCancelled, person, query]);
  const people = useMemo(() => peopleOf(data.events), [data.events]);
  const counts = useMemo(() => {
    const base = filterEvents(data.events, { kinds: new Set(ALL_KINDS), showCancelled, person, query });
    return Object.fromEntries(ALL_KINDS.map((k) => [k, base.filter((e) => e.kind === k).length]));
  }, [data.events, showCancelled, person, query]);
  const sourceFor = { guest: data.sources.guests, quotation: data.sources.quotations, confirmation: data.sources.confirmations, payment: data.sources.confirmations };

  const toggleKind = (kind) => {
    const next = new Set(kinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setKinds(next);
    write({ kinds: [...next] });
  };

  const step = (direction) => setAnchor(stepAnchor(view, anchor, direction));
  const openDay = (day) => {
    setMini(startOfMonth(day));
    go({ view: 'day', date: day });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || opened) return;
      const key = e.key.toLowerCase();
      const chosen = VIEWS.find((v) => v.key === key);
      if (chosen) setView(chosen.value);
      else if (key === 't') setAnchor(todayIso());
      else if (key === 'arrowleft' || key === 'k') step(-1);
      else if (key === 'arrowright' || key === 'j') step(1);
      else if (key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportIcs = () => {
    if (!visible.length) return;
    saveBlob(new Blob([buildIcs(visible)], { type: 'text/calendar;charset=utf-8' }), `7Heaven_travel_calendar_${range.from}_to_${range.to}.ics`);
  };

  const props = { anchor, events: visible, weekStart, today, onOpen: setOpened, onDay: openDay };
  const empty = !loading && !error && visible.length === 0;
  const hiddenSources = Object.entries({ Inquiries: data.sources.guests, Quotations: data.sources.quotations, Bookings: data.sources.confirmations }).filter(([, ok]) => !ok).map(([name]) => name);

  return (
    <div className="itin-page cal-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Travel Calendar</h2>
            <span className="count-chip">{visible.length} {visible.length === 1 ? 'trip' : 'trips'} shown</span>
          </div>
          <p className="page-subtitle">Every inquiry, quotation and booking by its travel dates (travel in green, payment deadlines in yellow), each under the guest's name. Press a trip for its details, a day to open it. Keys: <kbd>t</kbd> today, <kbd>m</kbd> <kbd>w</kbd> <kbd>d</kbd> <kbd>a</kbd> views, <kbd>←</kbd> <kbd>→</kbd> move, <kbd>/</kbd> search.</p>
        </div>
      </div>

      <div className="cal-layout">
        <aside className="glass-panel cal-side" aria-label="Calendar options">
          <MiniMonth cursor={mini} onCursor={setMini} anchor={anchor} today={today} weekStart={weekStart} events={visible} onPick={(d) => (view === 'agenda' ? go({ date: d }) : setAnchor(d))} />
          <fieldset className="cal-filter">
            <legend>Show</legend>
            {ALL_KINDS.map((kind) => (
              <label key={kind} className={sourceFor[kind] ? '' : 'is-off'} style={{ '--cal': KINDS[kind].color }}>
                <input type="checkbox" checked={kinds.has(kind) && sourceFor[kind]} disabled={!sourceFor[kind]} onChange={() => toggleKind(kind)} />
                <span className="cal-box" aria-hidden="true" />
                <span>{KINDS[kind].label}</span>
                <small>{sourceFor[kind] ? counts[kind] : '–'}</small>
              </label>
            ))}
            <label>
              <input type="checkbox" checked={showCancelled} onChange={(e) => { setShowCancelled(e.target.checked); write({ showCancelled: e.target.checked }); }} />
              <span className="cal-box is-plain" aria-hidden="true" />
              <span>Cancelled</span>
            </label>
          </fieldset>
          {people.length > 0 && (
            <div className="form-group">
              <label className="form-label" htmlFor="cal-person">Team member</label>
              <select id="cal-person" className="form-select" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Everyone</option>
                {people.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="cal-weekstart">Week starts on</label>
            <select id="cal-weekstart" className="form-select" value={weekStart} onChange={(e) => { const v = Number(e.target.value); setWeekStart(v); write({ weekStart: v }); }}>
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </div>
          {hiddenSources.length > 0 && <p className="cal-note">{hiddenSources.join(', ')} are not shown: you do not have access to them.</p>}
        </aside>

        <section className="glass-panel cal-main" aria-label="Calendar">
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAnchor(todayIso())}>Today</button>
              <button type="button" className="btn-icon btn-outline" onClick={() => step(-1)} aria-label={`Previous ${view === 'agenda' ? '30 days' : view}`}><ChevronLeft size={16} /></button>
              <button type="button" className="btn-icon btn-outline" onClick={() => step(1)} aria-label={`Next ${view === 'agenda' ? '30 days' : view}`}><ChevronRight size={16} /></button>
              <h3 className="cal-title" aria-live="polite">{titleOf(view, anchor, weekStart)}</h3>
              {loading && <Loader2 size={16} className="animate-spin" aria-label="Loading" />}
            </div>
            <div className="cal-tools">
              <div className="itin-search cal-search">
                <Search size={15} aria-hidden="true" />
                <input ref={searchRef} type="search" className="form-input" placeholder="Search client, place, reference…" aria-label="Search the calendar" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="itin-tabs" role="tablist" aria-label="View">
                {VIEWS.map((v) => (
                  <button key={v.value} type="button" role="tab" aria-selected={view === v.value} className={view === v.value ? 'is-active' : ''} onClick={() => setView(v.value)} title={`${v.label} (${v.key})`}>{v.label}</button>
                ))}
              </div>
              <button type="button" className="btn-icon btn-outline" onClick={load} aria-label="Refresh the calendar" title="Refresh"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
              <button type="button" className="btn btn-outline btn-sm" onClick={exportIcs} disabled={!visible.length} title="Download these trips as a file for Google Calendar, Outlook or Apple Calendar"><Download size={14} /> .ics</button>
            </div>
          </div>

          {error ? (
            <div className="cal-state" role="alert"><p>{error}</p><button type="button" className="btn btn-outline" onClick={load}><RefreshCw size={14} /> Try again</button></div>
          ) : (
            <div className={loading ? 'cal-body is-loading' : 'cal-body'} aria-busy={loading}>
              {view === 'month' && <MonthView {...props} />}
              {view === 'week' && <WeekView {...props} />}
              {view === 'day' && <DayView {...props} />}
              {view === 'agenda' && <AgendaView {...props} range={range} />}
              {empty && view !== 'day' && view !== 'agenda' && <p className="cal-hint">No trips match in this period. Try another month, or clear the search and filters.</p>}
            </div>
          )}
        </section>
      </div>

      <EventDialog event={opened} onClose={() => setOpened(null)} onGo={(e) => navigate(e.link)} />
    </div>
  );
};

export default TravelCalendarPage;
