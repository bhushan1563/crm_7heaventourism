import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatLongDate } from './dateHelper';

describe('formatLongDate: a date the way the client writes it ("07 Mar 2026")', () => {
  it('writes a saved date, with or without the time part', () => {
    expect(formatLongDate('2026-03-07')).toBe('07 Mar 2026');
    expect(formatLongDate('2026-03-07T00:00:00.000Z')).toBe('07 Mar 2026');
    expect(formatLongDate('2026-12-31')).toBe('31 Dec 2026');
    expect(formatLongDate('2028-02-29')).toBe('29 Feb 2028'); // a leap day
  });

  it('never moves the day with the time zone: an ISO text for midnight is read from its own digits', () => {
    expect(formatLongDate('2026-03-07T00:00:00.000Z')).toBe('07 Mar 2026');
    expect(formatLongDate('2026-03-07T23:59:59.000Z')).toBe('07 Mar 2026');
  });

  it('accepts a Date object', () => {
    expect(formatLongDate(new Date(2026, 2, 7))).toBe('07 Mar 2026');
  });

  it('gives nothing for nothing, and hands back what is not a real date as it was typed (so nothing is lost)', () => {
    for (const empty of [undefined, null, '', 0]) expect(formatLongDate(empty)).toBe('');
    expect(formatLongDate('2026-02-31')).toBe('2026-02-31');
    expect(formatLongDate('2027-02-29')).toBe('2027-02-29'); // not a leap year
    expect(formatLongDate('2026-13-01')).toBe('2026-13-01');
    expect(formatLongDate('soon')).toBe('soon');
  });
});

describe('property', () => {
  it('every real day gives "DD Mon YYYY" for exactly that day, and never throws on any text', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('1900-01-01T12:00:00Z'), max: new Date('2099-12-31T12:00:00Z'), noInvalidDate: true }), (d) => {
        const iso = d.toISOString().slice(0, 10);
        const [y, m, day] = iso.split('-');
        const out = formatLongDate(iso);
        expect(out).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
        expect(out.startsWith(day)).toBe(true);
        expect(out.endsWith(y)).toBe(true);
        expect(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]).toBe(out.slice(3, 6));
      }),
      { numRuns: 400 }
    );
    fc.assert(fc.property(fc.string({ maxLength: 40 }), (text) => typeof formatLongDate(text) === 'string'), { numRuns: 400 });
  });
});
