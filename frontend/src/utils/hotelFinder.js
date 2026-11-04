// Shared logic of the hotel finder screens, with no React in it so every rule can be tested: checking the address before it is sent, turning
// a find into a saved record, a saved record into the hotel form, and a saved record into the rows and sections of the downloads.

export const FIND_STEPS = [
  'Checking the address…',
  'Asking the website what it allows…',
  'Reading the home page…',
  'Looking for the contact, rooms and facilities pages…',
  'Reading those pages…',
  'Putting the details together…'
];

export const LEVEL_WORDS = { high: 'Sure', medium: 'Probably right', low: 'Please check' };
export const LEVEL_HELP = {
  high: 'Several sources agree, or the hotel stated it for programs to read.',
  medium: 'Found on the page, but from one source or in words rather than stated data.',
  low: 'A weak sign only. Check it before you use it.'
};

// ---- the address box ----

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const DANGEROUS = /^(?:javascript|data|file|ftp|mailto|tel|blob|about|view-source|ws|wss):/i;

/**
 * A first check of what was typed, so a mistake is shown at once without waiting for the server (which repeats these checks and also
 * refuses private and reserved addresses). Returns { ok: true, url } or { ok: false, message }.
 */
export const checkAddress = (input) => {
  let text;
  try { text = String(input ?? '').trim(); } catch { text = ''; }
  if (!text) return { ok: false, message: "Please paste the hotel's website address." };
  if (text.length > 2048) return { ok: false, message: "That address is too long. Paste the hotel's home page address instead." };
  if (/\s/.test(text)) return { ok: false, message: 'The address has a space in it. Paste just one web address, for example https://www.example-hotel.com' };
  if (DANGEROUS.test(text)) return { ok: false, message: 'Only web addresses starting with http:// or https:// can be read.' };
  let url;
  try {
    url = new URL(SCHEME.test(text) ? text : text.startsWith('//') ? `https:${text}` : `https://${text}`);
  } catch {
    return { ok: false, message: 'That does not look like a web address. Example: https://www.example-hotel.com' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, message: 'Only web addresses starting with http:// or https:// can be read.' };
  if (url.username || url.password) return { ok: false, message: 'Addresses with a user name or password in them are not accepted. Paste the plain web address.' };
  if (!url.hostname.includes('.') || /^\.|\.$|\.\./.test(url.hostname)) return { ok: false, message: 'The website name does not look right. Example: https://www.example-hotel.com' };
  return { ok: true, url: text };
};

// ---- words for numbers ----

const rs = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
// The company works in rupees (Rs); a hotel in another country prints its own currency, which is shown as its three-letter code, as found.
export const money = (currency, amount) => `${!currency || currency === 'INR' ? 'Rs' : currency} ${rs(amount)}`;

/** "Rs 3,500 to Rs 6,000 a night" */
export const ratesText = (rates) => {
  if (!rates || !(rates.from > 0)) return '';
  const unit = rates.unit === 'person' ? 'per person' : 'a night';
  return rates.to > rates.from ? `${money(rates.currency, rates.from)} to ${money(rates.currency, rates.to)} ${unit}` : `${money(rates.currency, rates.from)} ${unit}`;
};

export const timeWords = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${suffix}`;
};

export const mapUrl = (geo) => (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) ? `https://www.google.com/maps?q=${geo.lat},${geo.lng}` : '');

// ---- a find -> a saved record ----

const strings = (list) => (list || []).map((x) => String(x || '').trim()).filter(Boolean);

/**
 * What the finder returned (the `data` of a find) as the record to save. `photos` are the references of pictures already copied into
 * the app; `edits` are values the person changed on the result screen.
 */
export const foundFromFind = (data, { photos = [], edits = {} } = {}) => {
  const hotel = { ...data.hotel, ...edits };
  const levels = {};
  for (const [key, info] of Object.entries(data.fieldInfo || {})) if (info && info.level) levels[key] = info.level;
  if (data.fieldInfo?.phones?.[0]) levels.phones = data.fieldInfo.phones[0].level;
  if (data.fieldInfo?.emails?.[0]) levels.emails = data.fieldInfo.emails[0].level;
  const clean = (text) => String(text || '').replace(/<[^>]*>/g, '').trim();
  return {
    name: hotel.name,
    propertyType: hotel.propertyType || '',
    starRating: hotel.starRating || 'Unrated',
    tagline: hotel.tagline || '',
    description: hotel.description || '',
    address: { ...{ full: '', street: '', locality: '', region: '', postalCode: '', country: '' }, ...(hotel.address || {}) },
    geo: hotel.geo || null,
    phones: strings((hotel.phones || []).map((p) => (typeof p === 'string' ? p : p.display))),
    emails: strings(hotel.emails),
    website: hotel.website || '',
    social: (hotel.social || []).map(({ network, url }) => ({ network, url })),
    checkIn: hotel.checkIn || '',
    checkOut: hotel.checkOut || '',
    amenities: strings(hotel.amenities),
    rooms: (hotel.rooms || []).map((r) => ({ name: r.name, details: r.details || '' })),
    rates: hotel.rates ? { currency: hotel.rates.currency, from: hotel.rates.from, to: hotel.rates.to, unit: hotel.rates.unit, text: hotel.rates.text || '', note: hotel.rates.note || '', lines: (hotel.rates.lines || []).map(({ text, from, to, unit }) => ({ text, from, to, unit })) } : null,
    priceLevel: hotel.priceLevel || 0,
    guestRating: hotel.guestRating || null,
    policies: { cancellation: '', children: '', pets: '', ...(hotel.policies || {}) },
    photos,
    sourceUrl: data.sourceUrl || '',
    source: data.source === 'pasted' ? 'pasted' : 'website',
    completeness: data.completeness ? { score: data.completeness.score, found: data.completeness.found, missing: data.completeness.missing } : null,
    warnings: (data.warnings || []).map(clean),
    pagesRead: (data.pages || []).filter((p) => p.url).map((p) => ({ url: p.url, label: p.label || 'Page' })),
    fieldLevels: levels
  };
};

// ---- a saved record -> the hotel form ----

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text with blank lines between paragraphs -> the simple HTML the hotel form's editor holds. */
export const paragraphsHtml = (text) =>
  String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

const HOTEL_LIMITS = { name: 150, city: 100, country: 80, area: 100, address: 300, amenities: 40, amenityLength: 40 };

/**
 * The hotel form's starting values taken from a found hotel. The hotel list needs a name and a city; everything the find did not give is
 * left empty (or at the form's usual value) for the person to fill in. Nothing is invented.
 */
export const foundToHotelForm = (found, base = {}) => {
  const a = found.address || {};
  const addressLine = [a.street, a.locality, a.region, a.postalCode].filter(Boolean).join(', ') || a.full || '';
  const notes = [`Found with the hotel finder${found.sourceUrl ? ` at ${found.sourceUrl}` : ''}.`, found.rates?.text ? `Rates as printed there: ${found.rates.text}` : ratesText(found.rates) ? `Rates as printed there: ${ratesText(found.rates)}` : '', found.rates ? 'Check them with the hotel before quoting.' : ''].filter(Boolean).join(' ');
  const policy = found.policies?.cancellation;
  return {
    ...base,
    name: String(found.name || '').slice(0, HOTEL_LIMITS.name),
    city: String(a.locality || '').slice(0, HOTEL_LIMITS.city),
    country: String(a.country || '').slice(0, HOTEL_LIMITS.country),
    area: '',
    address: String(addressLine).slice(0, HOTEL_LIMITS.address),
    starRating: found.starRating || 'Unrated',
    description: paragraphsHtml(found.description),
    photos: (found.photos || []).map(({ token, width, height, caption }) => ({ token, width, height, caption: caption || '' })),
    phone: (found.phones || [])[0] || '',
    email: (found.emails || [])[0] || '',
    website: found.website || '',
    checkInTime: found.checkIn || base.checkInTime || '14:00',
    checkOutTime: found.checkOut || base.checkOutTime || '11:00',
    amenities: strings(found.amenities).map((x) => x.slice(0, HOTEL_LIMITS.amenityLength)).slice(0, HOTEL_LIMITS.amenities),
    cancellationPolicy: policy ? paragraphsHtml(policy) : '',
    notes: paragraphsHtml(notes),
    tags: base.tags || []
  };
};

/** What the hotel list still needs from the person: the required fields the find left empty. */
export const missingForHotel = (form) => {
  const out = [];
  if (!String(form.name || '').trim()) out.push({ key: 'name', label: 'the name of the hotel' });
  if (!String(form.city || '').trim()) out.push({ key: 'city', label: 'the city' });
  return out;
};

// ---- a saved record -> sections for the downloads ----

/** Sections of label/value rows, the same for Word, PDF and CSV. Empty facts are left out, never shown as blanks. */
export const foundSections = (found) => {
  const a = found.address || {};
  const row = (label, value) => (value === undefined || value === null || value === '' ? null : [label, String(value)]);
  const sections = [];
  const add = (title, rows, extra = {}) => {
    const kept = rows.filter(Boolean);
    if (kept.length || extra.list?.length || extra.text) sections.push({ title, rows: kept, ...extra });
  };
  add('Hotel', [row('Name', found.name), row('Kind of property', found.propertyType), row('Rating', found.starRating && found.starRating !== 'Unrated' ? found.starRating : ''), row('Tagline', found.tagline), row('Guest rating', found.guestRating ? `${found.guestRating.value} out of ${found.guestRating.best}${found.guestRating.count ? ` (${found.guestRating.count.toLocaleString('en-IN')} reviews)` : ''}` : '')]);
  add('About', [], { text: found.description });
  add('Contact', [...(found.phones || []).map((p, i) => row(i === 0 ? 'Phone' : 'Phone ' + (i + 1), p)), ...(found.emails || []).map((e, i) => row(i === 0 ? 'Email' : 'Email ' + (i + 1), e)), row('Website', found.website), ...(found.social || []).map((s) => row(s.network.charAt(0).toUpperCase() + s.network.slice(1), s.url))]);
  add('Location', [row('Address', a.full), row('Street', a.street), row('City', a.locality), row('State or region', a.region), row('Postal code', a.postalCode), row('Country', a.country), row('Map', mapUrl(found.geo))]);
  add('Stay', [row('Check-in', timeWords(found.checkIn)), row('Check-out', timeWords(found.checkOut))]);
  add('Rooms', [], { list: (found.rooms || []).map((r) => (r.details ? `${r.name}: ${r.details}` : r.name)) });
  add('Amenities', [], { list: found.amenities || [] });
  add('Rates', [row('As printed on the website', ratesText(found.rates)), row('Note', found.rates?.note), ...(found.rates?.lines || []).map((l) => row('Line', l.text))]);
  add('Policies', [row('Cancellation', found.policies?.cancellation), row('Children', found.policies?.children), row('Pets', found.policies?.pets)]);
  add('Source', [row('Found at', found.sourceUrl), row('Found on', found.foundAt ? new Date(found.foundAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''), row('How complete', found.completeness ? `${found.completeness.score} out of 100` : ''), row('Notes', found.notes)], { list: found.warnings || [] });
  return sections;
};

/** Rows for a CSV file: Section, Field, Value. One fact per row, so the file opens as a clear table in Excel. */
export const foundCsvRows = (found) => {
  const rows = [];
  for (const section of foundSections(found)) {
    for (const [label, value] of section.rows) rows.push({ Section: section.title, Field: label, Value: value });
    if (section.text) rows.push({ Section: section.title, Field: 'Text', Value: section.text });
    (section.list || []).forEach((item, i) => rows.push({ Section: section.title, Field: `${section.title === 'Source' ? 'Warning' : 'Item'} ${i + 1}`, Value: item }));
  }
  return rows;
};

export const foundFileName = (found, extension) => {
  const base = String(found?.name || 'hotel').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'hotel';
  return `${base}-details.${extension}`;
};

export const statusLabel = (status) => (status === 'Added' ? 'In the hotel list' : 'Saved');
