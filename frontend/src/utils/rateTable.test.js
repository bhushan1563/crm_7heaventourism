import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { OPTIONAL_KINDS, addRateRow, blankRow, hasKind, missingKinds, patchRateRow, removeRateRow, startRates, typedCount, typedRate } from './rateTable';
import { RATE_KINDS, RATE_LIMITS, hotelTotal } from './hotelRates';

describe('the rows of a hotel\'s rate table', () => {
  it('starts with the room for 2 adults and nothing else; the extras are optional', () => {
    expect(startRates()).toEqual([{ kind: 'room', label: '2 Adults', rate: 0, nights: null, rooms: null }]);
    expect(missingKinds(startRates())).toEqual(['extraBed', 'childWithBed', 'childNoBed']);
    expect(OPTIONAL_KINDS).toEqual(['extraBed', 'childWithBed', 'childNoBed']);
  });

  it('names the rows the way the client does', () => {
    expect(blankRow('extraBed').label).toBe('Extra bed');
    expect(blankRow('childWithBed').label).toBe('Child With bed');
    expect(blankRow('childNoBed').label).toBe('Child No Bed');
  });

  it('adds an extra row once, and keeps the rows in the client\'s order whatever order they were added in', () => {
    let rows = addRateRow(startRates(), 'childNoBed');
    rows = addRateRow(rows, 'extraBed');
    rows = addRateRow(rows, 'childWithBed');
    expect(rows.map((r) => r.kind)).toEqual(['room', 'extraBed', 'childWithBed', 'childNoBed']);
    expect(addRateRow(rows, 'extraBed')).toBe(rows); // already there: nothing changes
    expect(missingKinds(rows)).toEqual([]);
  });

  it('refuses a kind it does not know and a fifth row', () => {
    const rows = startRates();
    expect(addRateRow(rows, 'suite')).toBe(rows);
    const full = RATE_KINDS.map(blankRow);
    expect(addRateRow(full, 'room')).toBe(full);
    expect(full.length).toBe(RATE_LIMITS.rows);
  });

  it('takes an optional row away, but never the room', () => {
    const rows = addRateRow(startRates(), 'extraBed');
    expect(removeRateRow(rows, 'extraBed').map((r) => r.kind)).toEqual(['room']);
    expect(removeRateRow(rows, 'room')).toBe(rows);
    expect(hasKind(removeRateRow(rows, 'extraBed'), 'extraBed')).toBe(false);
  });

  it('changes one row and leaves the others alone', () => {
    const rows = addRateRow(startRates(), 'extraBed');
    const next = patchRateRow(rows, 'extraBed', { rate: 1500, nights: 2 });
    expect(next[0]).toBe(rows[0]);
    expect(next[1]).toMatchObject({ kind: 'extraBed', rate: 1500, nights: 2, rooms: null });
    expect(rows[1].rate).toBe(0); // the old list is not changed
  });
});

describe('typed numbers', () => {
  it('a rate is an amount with at most two decimals, never negative, never above the limit; nothing typed is 0', () => {
    expect(typedRate('5000')).toBe(5000);
    expect(typedRate('5000.456')).toBe(5000.46);
    expect(typedRate('')).toBe(0);
    expect(typedRate('-3')).toBe(0);
    expect(typedRate('abc')).toBe(0);
    expect(typedRate('99999999999')).toBe(RATE_LIMITS.maxRate);
  });

  it('nights and rooms are whole numbers up to the limit; nothing typed means "follow the stay"', () => {
    expect(typedCount('', 365)).toBeNull();
    expect(typedCount(null, 365)).toBeNull();
    expect(typedCount('3', 365)).toBe(3);
    expect(typedCount('2.9', 365)).toBe(2);
    expect(typedCount('-4', 365)).toBe(0);
    expect(typedCount('9999', 365)).toBe(365);
    expect(typedCount('x', 365)).toBeNull();
    expect(typedCount('0', 365)).toBe(0); // a typed zero is a real zero, not "follow the stay"
  });
});

describe('property', () => {
  const kind = fc.constantFrom(...RATE_KINDS);
  it('whatever is added or removed, a hotel has each kind at most once, in the client\'s order, and the room is never lost', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom('add', 'remove'), kind), { maxLength: 20 }), (steps) => {
        let rows = startRates();
        for (const [action, k] of steps) rows = action === 'add' ? addRateRow(rows, k) : removeRateRow(rows, k);
        const kinds = rows.map((r) => r.kind);
        expect(new Set(kinds).size).toBe(kinds.length);
        expect(kinds[0]).toBe('room');
        expect(kinds).toEqual([...kinds].sort((a, b) => RATE_KINDS.indexOf(a) - RATE_KINDS.indexOf(b)));
        expect(kinds.length).toBeLessThanOrEqual(RATE_LIMITS.rows);
      }),
      { numRuns: 300 }
    );
  });

  it('typed rates and counts are always inside the limits, so a total can always be counted', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 12 }), fc.double(), fc.integer()), (raw) => {
        const rate = typedRate(raw);
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(RATE_LIMITS.maxRate);
        const count = typedCount(String(raw), RATE_LIMITS.maxNights);
        if (count !== null) {
          expect(Number.isInteger(count)).toBe(true);
          expect(count).toBeGreaterThanOrEqual(0);
          expect(count).toBeLessThanOrEqual(RATE_LIMITS.maxNights);
        }
        const stay = { nights: '3 Nights', noOfRooms: '2 Rooms', rates: [{ kind: 'room', rate, nights: count, rooms: typedCount(String(raw), RATE_LIMITS.maxUnits) }] };
        expect(Number.isFinite(hotelTotal(stay))).toBe(true);
      }),
      { numRuns: 400 }
    );
  });
});
