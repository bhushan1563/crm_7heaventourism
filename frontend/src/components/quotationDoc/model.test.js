import { describe, expect, it } from 'vitest';
import { buildModel, dayBlurb, overnightOf, journeyStops, nightsAndDays, numberWord, overviewRows, parseDay, rangeText, splitDestination, splitLabel, toUtcDate, welcomeParagraphs } from './model';

describe('durations and dates', () => {
  it('reads nights and days from the usual ways of writing a duration', () => {
    expect(nightsAndDays('8 Nights / 9 Days')).toEqual({ nights: 8, days: 9 });
    expect(nightsAndDays('7 Nights')).toEqual({ nights: 7, days: 8 });
    expect(nightsAndDays('7')).toEqual({ nights: 7, days: 8 }); // a bare number is the nights
    expect(nightsAndDays('5 Days')).toEqual({ nights: 4, days: 5 });
    expect(nightsAndDays('')).toEqual({ nights: 0, days: 0 });
  });

  it('keeps a date on the day that was typed whatever the time zone', () => {
    expect(toUtcDate('2026-12-12T18:30:00.000Z').toISOString().slice(0, 10)).toBe('2026-12-12');
    expect(toUtcDate('14-11-2026').toISOString().slice(0, 10)).toBe('2026-11-14');
    expect(toUtcDate('')).toBeNull();
    expect(toUtcDate('not a date')).toBeNull();
  });

  it('writes a range of dates the short way', () => {
    expect(rangeText(toUtcDate('2026-12-12'), toUtcDate('2026-12-14'))).toBe('12 – 14 December');
    expect(rangeText(toUtcDate('2026-12-30'), toUtcDate('2027-01-02'))).toBe('30 Dec – 2 Jan');
    expect(rangeText(toUtcDate('2026-12-12'), null)).toBe('12 December');
  });

  it('splits a destination at the first comma and counts to twenty in words', () => {
    expect(splitDestination('Bali, Indonesia')).toEqual({ place: 'Bali', country: 'Indonesia' });
    expect(splitDestination('Goa')).toEqual({ place: 'Goa', country: '' });
    expect(numberWord(9)).toBe('nine');
    expect(numberWord(30)).toBe('30');
  });
});

describe('a day of the itinerary', () => {
  it('lays labelled lines out as rows of bullets, joining lines that share a label', () => {
    const day = parseDay('<p>Morning: Breakfast at the hotel.</p><p>Morning: Visit the temple.</p><p>Evening: Overnight stay.</p>');
    expect(day.rows.map((r) => r.label)).toEqual(['Morning', 'Evening']);
    expect(day.rows[0].items).toHaveLength(2);
  });

  it('keeps the formatting inside a line, as a paragraph the document recognises as formatted', () => {
    const day = parseDay('<p>Morning: <strong>Breakfast</strong> at the hotel.</p><p>See the <em>old fort</em></p>');
    expect(day.rows[0].items[0]).toBe('<p><strong>Breakfast</strong> at the hotel.</p>');
    expect(day.rows).toHaveLength(1); // a line with no label belongs to the row above it
    expect(day.rows[0].items[1]).toBe('<p>See the <em>old fort</em></p>');
    expect(parseDay('<p>See the <em>old fort</em></p>').rows[0].label).toBe('');
  });

  it('takes lines of a bulleted list, line breaks and plain text as lines too', () => {
    expect(parseDay('<ul><li>One</li><li>Two</li></ul>').rows[0].items).toHaveLength(2);
    expect(parseDay('<p>One<br>Two</p>').rows[0].items).toHaveLength(2);
    expect(parseDay('First line\nSecond line\n\nThird').rows[0].items).toHaveLength(3);
  });

  it('sets aside a summary, boxed notes and the "why this day" text', () => {
    const day = parseDay('<p>Summary: Temples by day</p><p>Morning: Go</p><p>Note: No children under 7.</p><p>Why this day: The light is best.</p>');
    expect(day.summary).toContain('Temples by day');
    expect(day.callouts).toHaveLength(1);
    expect(day.callouts[0].title).toBe('Note');
    expect(day.why).toContain('The light is best.');
    expect(day.rows.map((r) => r.label)).toEqual(['Morning']);
  });

  it('does not take a long sentence or a web address for a label', () => {
    expect(splitLabel('Arrive at the airport and meet our representative: he holds a sign').label).toBe('');
    expect(splitLabel('https://example.com/map').label).toBe('');
    expect(splitLabel('Lunch: Local restaurant').label).toBe('Lunch');
  });

  it('chooses a blurb that says what happens, not the routine', () => {
    const day = parseDay('<p>Morning: Breakfast at the hotel.</p><p>Morning: Visit the Uluwatu Temple on the cliff.</p>');
    expect(dayBlurb(day)).toBe('Visit the Uluwatu Temple on the cliff.');
    expect(dayBlurb(parseDay('<p>Summary: A quiet day</p>'))).toBe('A quiet day');
    expect(dayBlurb(parseDay(''))).toBe('');
  });
});

describe('the trip', () => {
  const quotation = {
    quotationType: 'Package', quotationNo: '7H-QT-1', destination: 'Bali, Indonesia', duration: '8 Nights / 9 Days', paxDetails: '2 Adults', travelDate: '2026-12-12',
    itinerary: [{ stay: 'Kuta' }, { stay: 'Kuta' }, { stay: 'Ubud' }, { stay: '' }],
    packageDetails: { hotels: [{ city: 'Kuta', hotelName: 'Fairfield', starRating: '4 star', nights: '2 Nights', checkInDate: '2026-12-12', checkOutDate: '2026-12-14', mealPlan: 'Breakfast' }] }
  };

  it('joins the nights of the same place into one stop', () => {
    expect(journeyStops(quotation)).toEqual([{ name: 'Kuta', nights: 2 }, { name: 'Ubud', nights: 1 }]);
    expect(journeyStops({ packageDetails: quotation.packageDetails, itinerary: [] })).toEqual([{ name: 'Kuta', nights: 2 }]);
  });

  it('lists the hotel stays for the overview table', () => {
    expect(overviewRows(quotation)).toEqual([{ when: '12 – 14 December', where: 'Kuta', hotel: 'Fairfield (4★)', meals: 'Breakfast' }]);
  });

  it('works out the end date, the labels and the brand from the quotation', () => {
    const m = buildModel(quotation);
    expect(m.place).toBe('Bali');
    expect(m.country).toBe('Indonesia');
    expect(m.nights).toBe(8);
    expect(m.end.toISOString().slice(0, 10)).toBe('2026-12-20');
    expect(m.dateRange).toBe('12 December 2026 — 20 December 2026');
    expect(m.footerLabel).toBe('BALI TOUR ITINERARY');
    expect(m.brand).toBe('7HEAVEN TOURISM');
    expect(m.stars).toBe(4);
  });

  it('says it is a confirmation on a booking, and uses the visa country for a visa', () => {
    expect(buildModel(quotation, { confirmation: true })).toMatchObject({ kicker: 'Booking confirmed for', footerLabel: 'BALI BOOKING CONFIRMATION' });
    expect(buildModel({ quotationType: 'Visa', destination: 'Schengen Visa', visa: { country: 'France' } }).place).toBe('France');
  });

  it('writes the welcome letter for each kind of quotation, naming the company and the place', () => {
    for (const type of ['Package', 'Only Hotel', 'Events / Corporate', 'Land Service', 'Visa']) {
      const text = welcomeParagraphs(buildModel({ ...quotation, quotationType: type })).join(' ');
      expect(text).toContain('7Heaven Tourism');
      expect(text).toContain('Bali');
    }
    expect(welcomeParagraphs(buildModel(quotation))[0]).toContain('nine-day');
  });
});

describe('where each night is spent', () => {
  const hotels = [
    { city: 'Srinagar', nights: '2 Nights', checkInDate: '2026-02-01', checkOutDate: '2026-02-03' },
    { city: 'Pahalgam', nights: '1 Night', checkInDate: '2026-02-03', checkOutDate: '2026-02-04' },
    { hotelName: 'Gulmarg Resort', city: '', nights: '2 Nights', checkInDate: '2026-02-04', checkOutDate: '2026-02-06' }
  ];
  const q = (over = {}) => ({ itinerary: Array.from({ length: 6 }, () => ({})), packageDetails: { hotels }, ...over });
  const start = toUtcDate('2026-02-01');

  it('takes it from the hotel stays by their dates, and leaves the last day without a night', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => overnightOf(q(), start, i))).toEqual(['Srinagar', 'Srinagar', 'Pahalgam', 'Gulmarg Resort', 'Gulmarg Resort', '']);
  });

  it('counts the nights of the stays in order when the trip has no start date', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => overnightOf(q(), null, i))).toEqual(['Srinagar', 'Srinagar', 'Pahalgam', 'Gulmarg Resort', 'Gulmarg Resort', '']);
  });

  it('keeps what was typed for a day, and finds nothing without hotels', () => {
    const typed = q({ itinerary: [{ stay: 'Houseboat' }, {}, {}, {}, {}, {}] });
    expect(overnightOf(typed, start, 0)).toBe('Houseboat');
    expect(overnightOf({ itinerary: [{}], packageDetails: { hotels: [] } }, start, 0)).toBe('');
  });
});

describe('the few words of a day in the list', () => {
  it('ends at a sentence instead of in the middle of one', () => {
    const day = parseDay('<p>Meet our representative at Srinagar airport, transfer to hotel . In the evening enjoy a Shikara ride on Dal Lake and watch the sunset behind the mountains.</p>');
    expect(dayBlurb(day)).toBe('Meet our representative at Srinagar airport, transfer to hotel.');
  });

  it('cuts a very long sentence at a word with an ellipsis', () => {
    const blurb = dayBlurb(parseDay(`<p>${'After breakfast we drive slowly through the valley stopping at many places '.repeat(3)}</p>`));
    expect(blurb.endsWith('…')).toBe(true);
    expect(blurb.length).toBeLessThanOrEqual(112);
  });
});

