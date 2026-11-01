import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LIMITS, addTag, emptyDay, emptyItinerary, excerpt, firstErrorKey, formatDuration, moveItem, toPayload, validateItinerary } from './itinerary';

const filled = (over = {}) => ({ ...emptyItinerary(), title: 'Bali', destination: 'Bali', days: [{ ...emptyDay(), title: 'Arrival' }], ...over });

describe('formatDuration', () => {
  it('reads like a brochure', () => {
    expect(formatDuration(5)).toBe('5 Nights / 6 Days');
    expect(formatDuration(1)).toBe('1 Night / 2 Days');
    expect(formatDuration(0)).toBe('Day trip');
    expect(formatDuration('3')).toBe('3 Nights / 4 Days');
    expect(formatDuration(undefined)).toBe('Day trip');
  });
});

describe('validateItinerary', () => {
  it('accepts a complete itinerary', () => {
    expect(validateItinerary(filled())).toEqual({});
  });
  it('names each missing piece in plain words', () => {
    const errors = validateItinerary(filled({ title: '  ', destination: '', nights: 99, days: [{ ...emptyDay(), title: 'ok' }, emptyDay()] }));
    expect(errors.title).toBe('Please enter a title for the itinerary.');
    expect(errors.destination).toBe('Please enter the destination.');
    expect(errors.nights).toMatch(/whole number from 0 to 60/);
    expect(errors['day-1']).toBe('Please enter a title for Day 2.');
    expect(errors['day-0']).toBeUndefined();
  });
  it('explains limits with the real numbers', () => {
    expect(validateItinerary(filled({ title: 'x'.repeat(151) })).title).toMatch(/151 characters; the limit is 150/);
    expect(validateItinerary(filled({ nights: 2.5 })).nights).toBeTruthy();
    expect(validateItinerary(filled({ days: Array.from({ length: 61 }, () => ({ ...emptyDay(), title: 'd' })) })).days).toMatch(/at most 60 days/);
  });
  it('points at the first problem in reading order', () => {
    const form = filled({ title: '', destination: '', days: [emptyDay()] });
    expect(firstErrorKey(validateItinerary(form), form)).toBe('title');
    const dayOnly = filled({ days: [{ ...emptyDay(), title: 'a' }, emptyDay()] });
    expect(firstErrorKey(validateItinerary(dayOnly), dayOnly)).toBe('day-1');
    expect(firstErrorKey({}, form)).toBeNull();
  });
});

describe('toPayload', () => {
  it('sends only what the server stores, with numbers as numbers', () => {
    const payload = toPayload(filled({ nights: '4', photos: [{ token: 'T'.repeat(24), width: 5, height: 5, caption: undefined }] }));
    expect(payload.nights).toBe(4);
    expect(payload.photos).toEqual([{ token: 'T'.repeat(24), caption: '' }]);
    expect(payload).not.toHaveProperty('_id');
    expect(Object.keys(payload).sort()).toEqual(['country', 'days', 'destination', 'exclusions', 'inclusions', 'nights', 'photos', 'status', 'summary', 'tags', 'title']);
  });
});

describe('addTag', () => {
  it('lower-cases, ignores blanks and duplicates, and enforces the limits', () => {
    expect(addTag([], '  Honey  Moon ').tags).toEqual(['honey moon']);
    expect(addTag(['beach'], 'BEACH').tags).toEqual(['beach']);
    expect(addTag(['a'], '   ').tags).toEqual(['a']);
    expect(addTag([], 'x'.repeat(31)).error).toMatch(/at most 30/);
    expect(addTag(Array.from({ length: 10 }, (_, i) => `t${i}`), 'one more').error).toMatch(/at most 10 tags/);
  });
});

describe('moveItem', () => {
  it('moves within bounds and ignores impossible moves', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
  });
  it('property: a move keeps the same items and the same length', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 20 }), fc.nat(25), fc.integer({ min: -3, max: 25 }), (list, from, to) => {
        const out = moveItem(list, from % list.length, to);
        expect(out).toHaveLength(list.length);
        expect([...out].sort()).toEqual([...list].sort());
      })
    );
  });
});

describe('excerpt', () => {
  it('gives a short plain preview of formatted or plain text', () => {
    expect(excerpt('<p>Welcome to <strong>Bali</strong></p>')).toBe('Welcome to Bali');
    expect(excerpt('plain   text\nhere')).toBe('plain text here');
    expect(excerpt('x'.repeat(300), 50)).toHaveLength(50);
    expect(excerpt('')).toBe('');
  });
});

describe('limits agree with the server', () => {
  it('uses the same numbers the API enforces', () => {
    expect(LIMITS).toMatchObject({ title: 150, destination: 120, maxNights: 60, maxDays: 60, photosPerDay: 6, itineraryPhotos: 10, dayDescription: 8000 });
  });
});
