import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { QUOTATION_LIMITS, dayLabel, detailsFrom, insertItinerary, mergeLines, photoCount, plainLines } from './itineraryInsert';

const photo = (n) => ({ token: `${n}`.padStart(24, 'p'), width: 1600, height: 1000, caption: `c${n}` });
const library = (days, extra = {}) => ({ title: 'Bali', destination: 'Bali', country: 'Indonesia', nights: 3, days, ...extra });
const day = (title, extra = {}) => ({ title, description: `<p>${title} text</p>`, stay: 'Ubud', meals: 'Dinner', photos: [], ...extra });
const existing = (n) => Array.from({ length: n }, (_, i) => ({ dayNumber: dayLabel(i + 1), title: `Mine ${i + 1}`, description: '', stay: '', meals: '', photos: [] }));

describe('insertItinerary', () => {
  it('copies every day, numbered from Day 01, with its text, stay, meals and photos', () => {
    const r = insertItinerary([], library([day('Arrival', { photos: [photo(1), photo(2)] }), day('Ubud')]));
    expect(r.ok).toBe(true);
    expect(r.added).toBe(2);
    expect(r.days.map((d) => d.dayNumber)).toEqual(['Day 01', 'Day 02']);
    expect(r.days[0]).toEqual({ dayNumber: 'Day 01', title: 'Arrival', description: '<p>Arrival text</p>', stay: 'Ubud', meals: 'Dinner', photos: [photo(1), photo(2)] });
  });

  it('replaces the current days by default', () => {
    const r = insertItinerary(existing(3), library([day('Only')]));
    expect(r.days.map((d) => d.title)).toEqual(['Only']);
  });

  it('can add after the current days, continuing the numbering', () => {
    const r = insertItinerary(existing(2), library([day('A'), day('B')]), 'append');
    expect(r.days.map((d) => [d.dayNumber, d.title])).toEqual([['Day 01', 'Mine 1'], ['Day 02', 'Mine 2'], ['Day 03', 'A'], ['Day 04', 'B']]);
  });

  it('gives the quotation its own copy: changing it never changes the library itinerary', () => {
    const source = library([day('Arrival', { photos: [photo(1)] })]);
    const snapshot = JSON.stringify(source);
    const r = insertItinerary([], source);
    r.days[0].title = 'Changed';
    r.days[0].photos[0].caption = 'Changed';
    r.days[0].photos.push(photo(9));
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('keeps only the fields a quotation stores (nothing else leaks in)', () => {
    const r = insertItinerary([], library([{ ...day('A'), _id: 'x', internalNote: 'secret', photos: [{ ...photo(1), extra: 'no' }] }]));
    expect(Object.keys(r.days[0]).sort()).toEqual(['dayNumber', 'description', 'meals', 'photos', 'stay', 'title']);
    expect(Object.keys(r.days[0].photos[0]).sort()).toEqual(['caption', 'height', 'token', 'width']);
  });

  it('explains why it cannot insert an itinerary with no days', () => {
    const r = insertItinerary([], library([]));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/has no days yet/);
  });

  it('explains when there would be too many days or photos, and suggests what to do', () => {
    const tooManyDays = insertItinerary(existing(58), library([day('A'), day('B'), day('C')]), 'append');
    expect(tooManyDays.ok).toBe(false);
    expect(tooManyDays.message).toMatch(/at most 60 days, and this would make 61/);
    expect(tooManyDays.message).toMatch(/Replace the days/);

    const heavy = existing(1).map((d) => ({ ...d, photos: Array.from({ length: 6 }, (_, i) => photo(i)) }));
    const many = library(Array.from({ length: 20 }, (_, i) => day(`D${i}`, { photos: Array.from({ length: 6 }, (_, k) => photo(100 + i * 6 + k)) })));
    const tooManyPhotos = insertItinerary(heavy, many, 'append');
    expect(tooManyPhotos.ok).toBe(false);
    expect(tooManyPhotos.message).toMatch(/at most 120 photos in total, and this would make 126/);
  });

  it('property: the result obeys the server limits or says why not, and never loses the days that were kept', () => {
    const libDay = fc.record({ title: fc.string({ maxLength: 20 }), description: fc.string({ maxLength: 30 }), photos: fc.array(fc.constant(0).map(() => photo(Math.floor(Math.random() * 1e6))), { maxLength: 6 }) });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 61 }), fc.array(libDay, { maxLength: 62 }), fc.constantFrom('replace', 'append'), (current, days, mode) => {
        const mine = existing(current);
        const r = insertItinerary(mine, library(days), mode);
        if (!r.ok) {
          expect(typeof r.message).toBe('string');
        } else {
          expect(r.days.length).toBeLessThanOrEqual(QUOTATION_LIMITS.maxDays);
          expect(photoCount(r.days)).toBeLessThanOrEqual(QUOTATION_LIMITS.totalPhotos);
          if (mode === 'append') expect(r.days.slice(0, current)).toEqual(mine);
          expect(r.days.map((d) => d.dayNumber)).toEqual(r.days.map((_, i) => dayLabel(i + 1)));
        }
      }),
      { numRuns: 300 }
    );
  });
});

describe('inclusion and exclusion lines', () => {
  it('turns formatted lines into plain single lines and drops blanks', () => {
    expect(plainLines(['Daily <b>breakfast</b>', '<p>Airport <strong>transfers</strong></p>', '   ', '<p></p>', 'Plain & simple'])).toEqual(['Daily <b>breakfast</b>', 'Airport transfers', 'Plain & simple']);
  });

  it('adds new lines after the existing ones without repeating a line that is already there', () => {
    expect(mergeLines(['Breakfast daily', 'Transfers'], ['  breakfast   DAILY ', 'Sightseeing'])).toEqual(['Breakfast daily', 'Transfers', 'Sightseeing']);
    expect(mergeLines([], ['a', 'A', 'b'])).toEqual(['a', 'b']);
    expect(mergeLines(undefined, undefined)).toEqual([]);
  });
});

describe('detailsFrom', () => {
  it('fills the destination and duration only where the quotation has none', () => {
    expect(detailsFrom({ destination: '', duration: '' }, library([]))).toEqual({ destination: 'Bali, Indonesia', duration: '3 Nights / 4 Days' });
    expect(detailsFrom({ destination: 'Dubai', duration: '' }, library([]))).toEqual({ duration: '3 Nights / 4 Days' });
    expect(detailsFrom({ destination: 'Dubai', duration: '5 Nights / 6 Days' }, library([]))).toEqual({});
    expect(detailsFrom({ destination: '   ' }, library([], { country: '' }))).toEqual({ destination: 'Bali', duration: '3 Nights / 4 Days' });
  });
});
