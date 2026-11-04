import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, addMonths, agendaDays, buildIcs, daysBetween, endOfMonth, eventsOnDay, filterEvents, isIso, layoutWeek, monthGrid, peopleOf, startOfWeek, stepAnchor, titleOf, todayIso, viewRange, weekDays, weekdayHeads } from './calendarGrid';

const ev = (id, start, end, over = {}) => ({ id, kind: 'quotation', title: id, ref: `R-${id}`, destination: 'Goa', status: 'Draft', sales: 'Sana', ops: 'Omar', pax: '2 Adults', start, end, ...over });

describe('dates as text', () => {
  it('adds days and months across month, year and leap ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(isIso('2026-02-30')).toBe(false);
    expect(isIso('2026-11-04')).toBe(true);
    expect(todayIso(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
  });
  it('finds the start of a week for Monday and Sunday weeks', () => {
    expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02'); // a Wednesday
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-02', 1)).toBe('2026-11-02');
    expect(startOfWeek('2026-11-01', 1)).toBe('2026-10-26'); // a Sunday belongs to the week before when weeks start on Monday
    expect(weekdayHeads(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(weekdayHeads(0)[0]).toBe('Sun');
  });
});

describe('the grids', () => {
  it('a month is whole weeks that contain every day of it', () => {
    const grid = monthGrid('2026-11-15', 1);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0][0]).toBe('2026-10-26');
    expect(grid[grid.length - 1][6]).toBe('2026-12-06'); // 30 Nov is a Monday, so its week is shown to the end
    expect(grid.flat()).toContain('2026-11-01');
    expect(monthGrid('2027-02-10', 1)).toHaveLength(4); // February 2027 starts on a Monday: exactly four weeks
  });
  it('property: any month grid is consecutive days, has the whole month, and at most 6 weeks', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 4000 }), fc.integer({ min: 0, max: 1 }), (n, start) => {
      const anchor = addDays('2020-01-01', n);
      const flat = monthGrid(anchor, start).flat();
      for (let i = 1; i < flat.length; i++) expect(daysBetween(flat[i - 1], flat[i])).toBe(1);
      expect(flat).toContain(anchor);
      expect(flat).toContain(endOfMonth(anchor));
      expect(flat.length / 7).toBeLessThanOrEqual(6);
      expect(new Date(`${flat[0]}T00:00:00Z`).getUTCDay()).toBe(start);
    }));
  });
  it('knows what each view needs and how it steps', () => {
    expect(viewRange('month', '2026-11-15', 1)).toEqual({ from: '2026-10-26', to: '2026-12-06' });
    expect(viewRange('week', '2026-11-04', 1)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(viewRange('day', '2026-11-04')).toEqual({ from: '2026-11-04', to: '2026-11-04' });
    expect(viewRange('agenda', '2026-11-04').to).toBe('2027-02-01');
    expect(stepAnchor('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(stepAnchor('week', '2026-11-04', -1)).toBe('2026-10-28');
    expect(stepAnchor('day', '2026-12-31', 1)).toBe('2027-01-01');
    expect(weekDays('2026-11-04', 1)).toHaveLength(7);
  });
  it('titles', () => {
    expect(titleOf('month', '2026-11-15')).toBe('November 2026');
    expect(titleOf('week', '2026-11-04', 1)).toBe('2 – 8 Nov 2026');
    expect(titleOf('week', '2026-11-30', 1)).toBe('30 Nov – 6 Dec 2026');
    expect(titleOf('week', '2026-12-30', 1)).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(titleOf('day', '2026-11-04')).toMatch(/Wednesday/);
  });
});

describe('bars of multi-day trips', () => {
  const week = weekDays('2026-11-04', 1); // 2 .. 8 Nov
  it('clips a trip to the week and says where it continues', () => {
    const { bars } = layoutWeek(week, [ev('a', '2026-10-30', '2026-11-03'), ev('b', '2026-11-07', '2026-11-12')]);
    const a = bars.find((b) => b.event.id === 'a');
    const b = bars.find((x) => x.event.id === 'b');
    expect([a.startCol, a.endCol, a.continuesBefore, a.continuesAfter]).toEqual([0, 1, true, false]);
    expect([b.startCol, b.endCol, b.continuesBefore, b.continuesAfter]).toEqual([5, 6, false, true]);
  });
  it('puts trips that share a day in different lanes and reuses a lane once it is free', () => {
    const { bars } = layoutWeek(week, [ev('a', '2026-11-02', '2026-11-04'), ev('b', '2026-11-03', '2026-11-05'), ev('c', '2026-11-05', '2026-11-06')]);
    const lane = (id) => bars.find((b) => b.event.id === id).lane;
    expect(lane('a')).not.toBe(lane('b'));
    expect(lane('c')).toBe(lane('a'));
  });
  it('counts what did not fit, on each day it falls', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => ev(id, '2026-11-04', '2026-11-04'));
    const { bars, hidden, lanes } = layoutWeek(week, many, 3);
    expect(bars).toHaveLength(3);
    expect(lanes).toBe(3);
    expect(hidden).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });
  it('property: no two drawn bars of a lane overlap, and what is not drawn is counted', () => {
    const day = fc.integer({ min: 0, max: 14 }).map((n) => addDays('2026-10-28', n));
    fc.assert(fc.property(fc.array(fc.tuple(day, fc.integer({ min: 0, max: 8 })), { maxLength: 12 }), (list) => {
      const events = list.map(([s, len], i) => ev(`e${i}`, s, addDays(s, len)));
      const { bars, hidden } = layoutWeek(week, events, 3);
      for (const x of bars) for (const y of bars) if (x !== y && x.lane === y.lane) expect(x.endCol < y.startCol || y.endCol < x.startCol).toBe(true);
      const touching = events.filter((e) => e.end >= week[0] && e.start <= week[6]);
      expect(hidden.reduce((a, b) => a + b, 0) >= touching.length - bars.length).toBe(true);
    }));
  });
});

describe('filters and lists', () => {
  const events = [
    ev('x', '2026-11-04', '2026-11-06', { kind: 'confirmation', title: 'Pujan', destination: 'Vietnam', sales: 'Bhushan', ops: 'Jigisha' }),
    ev('y', '2026-11-05', '2026-11-05', { kind: 'guest', title: 'Aarav', status: 'Cancelled' }),
    ev('z', '2026-11-20', '2026-11-22', { title: 'Nihar', destination: 'Andaman' })
  ];
  const all = new Set(['guest', 'quotation', 'confirmation']);
  it('filters by kind, by the cancelled switch, by person and by words', () => {
    expect(filterEvents(events, { kinds: all }).map((e) => e.id)).toEqual(['x', 'z']);
    expect(filterEvents(events, { kinds: all, showCancelled: true })).toHaveLength(3);
    expect(filterEvents(events, { kinds: new Set(['confirmation']) }).map((e) => e.id)).toEqual(['x']);
    expect(filterEvents(events, { kinds: all, person: 'Jigisha' }).map((e) => e.id)).toEqual(['x']);
    expect(filterEvents(events, { kinds: all, query: 'viet booking' }).map((e) => e.id)).toEqual(['x']);
    expect(filterEvents(events, { kinds: all, query: 'andaman' }).map((e) => e.id)).toEqual(['z']);
    expect(filterEvents(events, { kinds: all, query: 'nothing here' })).toEqual([]);
    expect(peopleOf(events)).toEqual(['Bhushan', 'Jigisha', 'Omar', 'Sana']);
  });
  it('lists the events of a day, and the days of the agenda that have any', () => {
    expect(eventsOnDay(events, '2026-11-05').map((e) => e.id)).toEqual(['x', 'y']);
    expect(agendaDays(events, '2026-11-01', '2026-11-30').map((d) => d.day)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-20', '2026-11-21', '2026-11-22']);
  });
});

describe('the .ics file', () => {
  const file = buildIcs([ev('a', '2026-11-10', '2026-11-13', { title: 'Nihar; Vashi, Jr', destination: 'Andaman', status: 'Cancelled' })], new Date('2026-11-04T10:20:30.123Z'));
  it('has all-day events whose end day is the day after, with special characters escaped', () => {
    expect(file.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(file.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(file).toContain('DTSTART;VALUE=DATE:20261110');
    expect(file).toContain('DTEND;VALUE=DATE:20261114');
    expect(file).toContain('DTSTAMP:20261104T102030Z');
    expect(file).toContain('SUMMARY:Nihar\\; Vashi\\, Jr - Andaman');
    expect(file).toContain('STATUS:CANCELLED');
    expect(file).toContain('UID:a@7heaven-crm');
  });
  it('folds long lines to at most 75 characters', () => {
    const long = buildIcs([ev('b', '2026-11-10', '2026-11-10', { title: 'x'.repeat(300) })]);
    for (const line of long.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  });
});
