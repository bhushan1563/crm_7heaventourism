// What the quotation document prints, worked out from a quotation. Pure functions (no React, no network) so the rules can be tested.
import { richBlocks } from '../../utils/itineraryDoc';
import { richToPlainText } from '../../utils/richText';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** A date as UTC midnight (so no timezone can move it a day), from an ISO string, a Date or a "dd-mm-yyyy" text; null when there is none. */
export const toUtcDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const text = String(value).trim();
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return null;
};
export const addDays = (date, n) => (date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n)) : null);
const two = (n) => String(n).padStart(2, '0');
export const longDate = (date) => (date ? `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : '');
export const dayMonth = (date) => (date ? `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}` : '');
export const shortDayMonth = (date) => (date ? `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}` : '');
export const weekday = (date) => (date ? DAYS[date.getUTCDay()] : '');
/** The number of a day or a page as the document prints it: 1 -> "01". */
export const pad2 = two;

/** "8 Nights / 9 Days", "7 Nights", "7" (a bare number is the nights), "9 Days" -> { nights, days } (0 when unknown). */
export const nightsAndDays = (duration) => {
  const text = clean(duration);
  const n = text.match(/(\d+)\s*nights?\b/i);
  const d = text.match(/(\d+)\s*days?\b/i);
  let nights = n ? Number(n[1]) : /^\d+$/.test(text) ? Number(text) : 0;
  let days = d ? Number(d[1]) : 0;
  if (nights && !days) days = nights + 1;
  if (days && !nights) nights = Math.max(days - 1, 0);
  return { nights, days };
};

/** "Bali, Indonesia" -> { place: "Bali", country: "Indonesia" }; the country is whatever follows the first comma. */
export const splitDestination = (destination) => {
  const text = clean(destination);
  const at = text.indexOf(',');
  return at < 0 ? { place: text, country: '' } : { place: text.slice(0, at).trim(), country: text.slice(at + 1).trim() };
};

// ---- photo sizes ---------------------------------------------------------------------------------------------------------
// The PDF renderer ignores CSS "object-fit" (it stretches the picture to the box), so every size is worked out here.

const ratioOf = (photo) => (Number(photo?.width) || 4) / (Number(photo?.height) || 3);

/** The size a photo is shown at inside a frame: as large as fits, in its own proportions (nothing cut off). */
export const fitIn = (photo, maxW, maxH) => {
  const width = Math.min(maxW, maxH * ratioOf(photo));
  return { width: Math.round(width), height: Math.round(width / ratioOf(photo)) };
};

/** Photos side by side, all as tall as each other and together as wide as the row (but never taller than `maxH`), each in its own proportions. */
export const rowSizes = (photos, width, gap, maxH) => {
  const height = Math.min(maxH, (width - gap * (photos.length - 1)) / photos.reduce((sum, p) => sum + ratioOf(p), 0));
  return photos.map((p) => ({ width: Math.floor(height * ratioOf(p)), height: Math.round(height) }));
};

/** The size and offset that make a photo fill a frame in its own proportions, centred (what sticks out is cut off by the frame). */
export const fill = (photo, frameW, frameH) => {
  const width = Math.max(frameW, frameH * ratioOf(photo));
  const height = width / ratioOf(photo);
  return { width: Math.round(width), height: Math.round(height), left: Math.round((frameW - width) / 2), top: Math.round((frameH - height) / 2) };
};

// ---- a day of the itinerary ---------------------------------------------------------------------------------------------

const DISTANCE_LABEL = /distance|drive time|journey time|travel time/i;
const CALLOUT_LABELS = ['note', 'notes', 'important', 'important note', 'important notes', 'please note', 'tip', 'age limit', 'child policy', 'caution', 'safety'];
const WHY_LABELS = ['why this day', 'why'];
const SUMMARY_LABELS = ['summary', 'overview', 'highlight'];
const TAG = /<[^>]*>/g;

/** The lines of a day's text, one for each paragraph, list item or line break, as safe HTML. */
export const dayLines = (description) => {
  const lines = [];
  for (const block of richBlocks(description)) {
    if (block.tag === 'p') {
      for (const part of block.html.split(/<br\s*\/?>/i)) if (richToPlainText(part).trim()) lines.push(`<p>${part.trim()}</p>`);
    } else {
      const items = block.html.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || [];
      for (const li of items) {
        const inner = li.replace(/^<li\b[^>]*>/i, '').replace(/<\/li>$/i, '').replace(/^<p>([\s\S]*)<\/p>$/i, (all, text) => text);
        if (richToPlainText(inner).trim()) lines.push(`<p>${inner.trim()}</p>`);
      }
    }
  }
  return lines;
};

/** "Morning: Breakfast" -> { label: "Morning", html: "Breakfast" }; a line without a short label in front has none. Formatting inside the text is kept. */
export const splitLabel = (html) => {
  const m = String(html).match(/^((?:<[^>]+>)*)\s*([A-Za-z][A-Za-z0-9 &/'’–-]{0,26}?)\s*:\s*((?:<\/[^>]+>)*)\s*([\s\S]+)$/);
  if (!m) return { label: '', html };
  const label = clean(m[2]);
  if (!label || label.split(' ').length > 3 || /^(https?|mailto|tel)$/i.test(label)) return { label: '', html };
  const lead = m[3] ? (m[1].match(/^<p>/i) || [''])[0] : m[1]; // a label that was bold on its own leaves no half-open tag behind
  const rest = `${lead}${m[4]}`.trim();
  return rest ? { label, html: rest } : { label: '', html };
};

/**
 * A day's text laid out like the document's day card: an optional summary line, rows (a label such as "Morning" with its bullets), and
 * the two kinds of boxed note ("Note: ..." and "Why this day: ..."). Text with no labels at all is one row of bullets.
 */
export const parseDay = (description) => {
  const out = { summary: '', distance: '', rows: [], callouts: [], why: '' };
  const wrap = (html) => html; // every line is already a paragraph (dayLines), which is how formatted text is recognised (see richText)
  let row = null;
  for (const line of dayLines(description)) {
    const { label, html } = splitLabel(line);
    const key = label.toLowerCase();
    if (label && WHY_LABELS.includes(key)) { out.why = out.why ? `${out.why}${wrap(html)}` : wrap(html); row = null; continue; }
    // a distance or a driving time belongs under the day's title, not in a row of its own
    if (label && DISTANCE_LABEL.test(label)) { out.distance = `<p>${label}: ${html.replace(/^<p>/i, '')}`; row = null; continue; }
    if (label && SUMMARY_LABELS.includes(key)) { out.summary = wrap(html); row = null; continue; }
    if (label && CALLOUT_LABELS.includes(key)) { out.callouts.push({ title: label.replace(/^\w/, (c) => c.toUpperCase()), html: wrap(html) }); row = null; continue; }
    if (label) {
      if (row && row.label.toLowerCase() === key) row.items.push(wrap(html));
      else { row = { label, items: [wrap(html)] }; out.rows.push(row); }
      continue;
    }
    if (!row) { row = { label: '', items: [] }; out.rows.push(row); }
    row.items.push(wrap(html));
  }
  return out;
};

const ROUTINE = /^(breakfast|overnight|return to|hotel check|check.?in|check.?out|welcome garland|drinking water|transfer arrangement|vehicle arrangement|full-day (private )?vehicle|meet )/i;

/** Text cut at the end of a sentence that fits `max` characters (one or two sentences), else at a word, with an ellipsis. */
const shorten = (text, max) => {
  const clean1 = text.replace(/\s+([.,;:!?])/g, (_, mark) => mark).trim(); // "hotel ." -> "hotel."
  if (clean1.length <= max) return clean1;
  const sentences = clean1.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  let out = '';
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out = `${out}${s}`;
  }
  if (out.trim().length >= 24) return out.trim();
  const cut = clean1.slice(0, max);
  const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' '));
  return `${cut.slice(0, at > 30 ? at : max).replace(/[\s,;:]+$/, '')}…`;
};

/** The few words that stand for a day in the list of days: its summary, else the first line that says what happens (not the routine), shortened. */
export const dayBlurb = (parsed, max = 110) => {
  const lines = [parsed.summary, ...parsed.rows.flatMap((r) => r.items)].map((h) => richToPlainText(h || '').replace(TAG, '').trim()).filter(Boolean);
  const text = parsed.summary ? lines[0] : lines.find((l) => !ROUTINE.test(l)) || lines[0] || '';
  return shorten(text, max);
};

/**
 * Where the night of day `index` (0-based) is spent: what was typed for the day, else the hotel stay that covers that night (by its check-in
 * and check-out dates when the trip has a start date, else by counting the nights of the stays in order). Empty on the last day, which has no night.
 */
export const overnightOf = (quotation, start, index) => {
  const typed = clean(quotation.itinerary?.[index]?.stay);
  if (typed) return typed;
  const own = quotation.packageDetails?.hotels || [];
  const stays = own.length ? own : quotation.options?.[0]?.hotels || [];
  const label = (h) => clean(h?.city) || clean(h?.hotelName);
  const date = start ? addDays(start, index) : null;
  if (date) {
    const hit = stays.find((h) => {
      const from = toUtcDate(h.checkInDate);
      const to = toUtcDate(h.checkOutDate);
      return from && to && +from <= +date && +date < +to;
    });
    if (hit) return label(hit);
  }
  let before = 0;
  for (const h of stays) {
    const nights = parseInt(String(h.nights), 10) || 0;
    if (index >= before && index < before + nights) return label(h);
    before += nights;
  }
  return '';
};

// ---- the document as a whole ---------------------------------------------------------------------------------------------

export const DEFAULT_COMPANY = {
  name: '7Heaven Tourism',
  tagline: 'Travel with Trust',
  description: '',
  address: '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara',
  phone: '+91 7862829178',
  email: 'sales@7heaventourism.in',
  website: 'www.7heaventourism.in'
};

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
/** 9 -> "nine" (up to twenty), otherwise the digits. */
export const numberWord = (n) => (Number.isInteger(n) && n >= 0 && n <= 20 ? WORDS[n] : String(n));
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The town at the end of an address ("..., Alkapuri 390007, Vadodara" -> "Vadodara"). */
const localityOf = (address) => clean(String(address || '').split(',').pop()).replace(/\d{5,6}/g, '').trim();

const FOOTER_NOUN = { Package: 'TOUR ITINERARY', 'Only Hotel': 'HOTEL STAY', 'Events / Corporate': 'EVENT PROPOSAL', 'Land Service': 'LAND SERVICES', Visa: 'VISA QUOTATION' };
const KICKER = { Package: 'A private journey to', 'Only Hotel': 'A stay in', 'Events / Corporate': 'An event in', 'Land Service': 'Land services in', Visa: 'Visa services for' };

/** The stars a set of hotel stays share ("4 star" -> 4), or 0 when they differ or none is rated. */
export const sharedStars = (hotels) => {
  const each = (hotels || []).map((h) => (String(h?.starRating || '').match(/\d/) || [''])[0]);
  return each.length && each.every((s) => s && s === each[0]) ? Number(each[0]) : 0; // one unrated hotel and the cover claims no stars
};

/** The places a trip stays in, in order, each with its nights: from the "night" of each day, else from the hotel stays. */
export const journeyStops = (quotation) => {
  const stops = [];
  const add = (name, nights = 1) => {
    const label = clean(name);
    if (!label) return;
    const last = stops[stops.length - 1];
    if (last && last.name.toLowerCase() === label.toLowerCase()) last.nights += nights;
    else stops.push({ name: label, nights });
  };
  const days = quotation.itinerary || [];
  if (days.some((d) => clean(d.stay))) days.forEach((d) => add(d.stay));
  else for (const h of quotation.packageDetails?.hotels || []) add(h.city || h.hotelName, parseInt(String(h.nights), 10) || 1);
  return stops;
};

/** What the document needs to know about the trip, in one place. */
export const buildModel = (quotation, { confirmation = false } = {}) => {
  const type = quotation.quotationType || 'Package';
  const company = { ...DEFAULT_COMPANY, ...(quotation.companyDetails || {}) };
  const { nights, days: nightsDays } = nightsAndDays(quotation.duration);
  const itinerary = quotation.itinerary || [];
  const days = nightsDays || itinerary.length;
  const start = toUtcDate(quotation.travelDate);
  const end = start && nights ? addDays(start, nights) : start && days > 1 ? addDays(start, days - 1) : null;
  const dest = type === 'Visa' && clean(quotation.visa?.country) ? { place: clean(quotation.visa.country), country: '' } : splitDestination(quotation.destination);
  const place = dest.place || clean(quotation.destination);
  const locality = localityOf(company.address);
  const hotels = quotation.packageDetails?.hotels || [];
  return {
    type,
    confirmation,
    company,
    brand: clean(company.name).toUpperCase(),
    locality,
    place,
    country: dest.country,
    kicker: confirmation ? 'Booking confirmed for' : KICKER[type] || KICKER.Package,
    footerLabel: confirmation ? `${(place || 'Your').toUpperCase()} BOOKING CONFIRMATION` : `${(place || 'Your').toUpperCase()} ${FOOTER_NOUN[type] || FOOTER_NOUN.Package}`,
    tripId: clean(quotation.quotationNo),
    guest: /[\p{L}\p{N}]/u.test(clean(quotation.clientName)) ? clean(quotation.clientName) : 'Valued Guest',
    travellers: clean(quotation.paxDetails),
    nights,
    days,
    start,
    end,
    dateRange: start && end ? `${longDate(start)} — ${longDate(end)}` : start ? longDate(start) : '',
    stops: journeyStops(quotation),
    stars: sharedStars(hotels),
    hotels
  };
};

/** The date of the i-th day of the trip (0-based), or null when the trip has no start date. */
export const dayDate = (model, i) => (model.start ? addDays(model.start, i) : null);

/** The letter on the welcome page: what this document is, how the trip is arranged, and how to ask for a change. */
export const welcomeParagraphs = (model) => {
  const { company, place, type, days } = model;
  const who = company.name;
  const where = place || 'your destination';
  const long = days > 1 ? `${numberWord(days)}-day ` : '';
  const change = 'please tell us before confirmation and we will rework the plan around it.';
  if (type === 'Visa') {
    return [
      `Thank you for choosing ${who} for your ${where} visa. This document sets out the visa we are applying for, the documents we need from each applicant, the fees, and what our service includes.`,
      'Processing times and requirements are set by the issuing authority and may change without notice; we will keep you informed at every step and tell you at once if anything more is asked of you.',
      `If anything here should be adjusted — an applicant added, a different type of visa, a change of dates — ${change}`,
      'We look forward to taking care of this for you.'
    ];
  }
  if (type === 'Land Service') {
    return [
      `Thank you for choosing ${who} for your land service in ${where}. This document sets out the vehicles we have arranged, the route, the rates, and what the service includes.`,
      'Timings shown are indicative and may shift with traffic, weather and road conditions on the day; our coordinator will confirm each pickup with you directly.',
      `If anything here should be adjusted — a different vehicle, an added stop, a change of timing — ${change}`,
      'We look forward to welcoming you on board.'
    ];
  }
  if (type === 'Only Hotel') {
    return [
      `Thank you for choosing ${who} for your stay in ${where}. This document sets out the hotels, the rooms and the rates we have arranged for you, and what to expect when you arrive.`,
      'Rooms and rates are held subject to availability until the booking is confirmed; check-in and check-out times are those of each hotel and may vary with the season.',
      `If anything here should be adjusted — a different hotel, a different room, an extra night — ${change}`,
      `We look forward to welcoming you to ${where}.`
    ];
  }
  const event = type === 'Events / Corporate';
  return [
    `Thank you for choosing ${who} for your ${event ? 'event' : 'holiday'} in ${where}. This document sets out your ${long}${event ? 'programme' : 'journey'} in full — where you stay, what each day holds, what the package includes, and what to prepare before you go.`,
    'Every transfer and sightseeing day in this plan has been arranged with care, so the pace of the trip stays yours. Timings shown are indicative and may shift with weather, traffic and operating conditions on the day; our representative will confirm each morning’s pickup with you directly.',
    `If anything here should be adjusted — a different hotel, an extra day at leisure, a change in the order of the tours — ${change}`,
    `We look forward to welcoming you to ${where}.`
  ];
};

/** "12 – 14 December" (one month), "28 Dec – 2 Jan" (two), or the one date. */
export const rangeText = (a, b) => {
  if (!a) return '';
  if (!b || +a === +b) return dayMonth(a);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) return `${a.getUTCDate()} – ${dayMonth(b)}`;
  return `${shortDayMonth(a)} – ${shortDayMonth(b)}`;
};

/** The rows of the overview table: when, where, which hotel, which meals; one for each hotel stay of a single offer. */
export const overviewRows = (quotation) =>
  (quotation.packageDetails?.hotels || [])
    .map((h) => {
      const stars = (String(h.starRating || '').match(/\d/) || [''])[0];
      return {
        when: rangeText(toUtcDate(h.checkInDate), toUtcDate(h.checkOutDate)),
        where: clean(h.city),
        hotel: `${clean(h.hotelName)}${stars && clean(h.hotelName) ? ` (${stars}★)` : ''}`,
        meals: clean(h.mealPlan)
      };
    })
    .filter((r) => r.where || r.hotel);
