import { squash } from './dom.js';

// Turning the odd ways websites write things (times, phone numbers, prices, star ratings, e-mail addresses) into one clean form.
// Pure functions with no page in sight, so each rule is tested on its own.

// ---- times ----

/** "2 PM", "14:00", "2:30 pm", "14h00", "noon", "T14:00:00+05:30" -> "14:00" (24 hours), or null when it is not a time. */
export const normalizeTime = (value) => {
  const text = squash(value).toLowerCase();
  if (!text) return null;
  if (/\bmidnight\b/.test(text)) return '00:00';
  if (/\bnoon\b/.test(text) && !/\d/.test(text.replace(/12\s*noon/, ''))) return '12:00';
  const match = /(?:^|[^\d])(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?|noon)?(?![\d])/i.exec(text.replace(/^t(?=\d)/, ' '));
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = (match[3] || '').replace(/[.\s]/g, '');
  if (minute > 59) return null;
  if (meridiem === 'pm') {
    if (hour < 1 || hour > 12) return null;
    if (hour < 12) hour += 12;
  } else if (meridiem === 'am') {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
  } else if (meridiem === 'noon') {
    if (hour !== 12) return null;
  } else if (hour > 23) return null;
  // A bare number with no colon and no am/pm ("2") is not a time.
  if (match[2] === undefined && !meridiem && !/[:h]/.test(text)) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// ---- phone numbers ----

const DATE_LIKE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$|^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$|^(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}$/;

/**
 * A phone number as written on a site -> { display, digits, key } or null when it is not one (a date, a price, a coordinate, a
 * long id). `key` is what two spellings of the same number share (its last ten digits).
 */
export const normalizePhone = (raw) => {
  let text = squash(raw).replace(/^[^\d+(]+|[^\d)]+$/g, '');
  if (!text) return null;
  text = text.replace(/\s*[-–—]\s*/g, '-').replace(/\s{2,}/g, ' ');
  if (DATE_LIKE.test(text)) return null;
  if (/^\d+\.\d+$/.test(text) || /^-?\d+\.\d{3,}/.test(text)) return null; // a coordinate or a decimal
  if (!/^[+\d(][\d\s().-]*$/.test(text)) return null;
  if ((text.match(/\(/g) || []).length !== (text.match(/\)/g) || []).length) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (/^(\d)\1+$/.test(digits)) return null;
  if (/^(?:0123456789|1234567890|12345678|123456789|9876543210)/.test(digits)) return null;
  const international = text.startsWith('+') || text.startsWith('00');
  if (!international && digits.length > 13) return null;
  return { display: text, digits, key: digits.slice(-10) };
};

// ---- e-mail ----

const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}$/i;
const JUNK_EMAIL_DOMAINS = /(?:^|\.)(?:example\.(?:com|org|net)|domain\.com|email\.com|yoursite\.com|yourdomain\.com|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|godaddy\.com|schema\.org|w3\.org|test\.com|mysite\.com|company\.com)$/i;
const JUNK_EMAIL_LOCALS = /^(?:your|name|email|user(?:name)?|example|test|sample|you|someone|first\.?last|john\.?doe|jane\.?doe|abc|xyz|info@info)$/i;

/** An e-mail address, tidied (lower case, no mailto:, no trailing punctuation), or null when it is not one or is obviously a placeholder. */
export const normalizeEmail = (raw) => {
  const text = squash(raw).replace(/^mailto:/i, '').split('?')[0].replace(/^[<("']+|[>)"'.,;:]+$/g, '').toLowerCase();
  if (!text || text.length > 254 || !EMAIL_RE.test(text)) return null;
  const [local, domain] = text.split('@');
  if (/\.(?:png|jpe?g|gif|webp|svg|css|js|ico|woff2?)$/i.test(domain) || /@\d+x\./.test(text)) return null;
  if (JUNK_EMAIL_DOMAINS.test(domain) || JUNK_EMAIL_LOCALS.test(local)) return null;
  if (/^(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster)$/i.test(local)) return null;
  return text;
};

// ---- stars ----

const WORD_NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** "5-star", "four star", "★★★★" -> 1..5, or null. Never 6 or 7 ("7-star" is marketing, not a rating). */
export const starsFromText = (value) => {
  const text = String(value ?? '');
  let m = /\b([1-5])\s*[- ]?\s*stars?\b/i.exec(text) || /\b([1-5])\s*\*\s*(?:hotel|resort|property)/i.exec(text);
  if (m) return Number(m[1]);
  m = /\b(one|two|three|four|five)[- ]stars?\b/i.exec(text);
  if (m) return WORD_NUMBER[m[1].toLowerCase()];
  m = /([★⭐]{1,5})(?![★⭐])/.exec(text);
  if (m && m[1].length >= 3) return m[1].length;
  return null;
};

// ---- money ----

const CURRENCY_SYMBOLS = [
  ['₹', 'INR'], ['Rs.', 'INR'], ['Rs', 'INR'], ['INR', 'INR'], ['US$', 'USD'], ['USD', 'USD'], ['$', 'USD'], ['€', 'EUR'], ['EUR', 'EUR'], ['£', 'GBP'], ['GBP', 'GBP'],
  ['AED', 'AED'], ['฿', 'THB'], ['THB', 'THB'], ['Rp.', 'IDR'], ['Rp', 'IDR'], ['IDR', 'IDR'], ['MYR', 'MYR'], ['RM', 'MYR'], ['S$', 'SGD'], ['SGD', 'SGD'],
  ['LKR', 'LKR'], ['NPR', 'NPR'], ['MVR', 'MVR'], ['JPY', 'JPY'], ['¥', 'JPY'], ['A$', 'AUD'], ['AUD', 'AUD'], ['CHF', 'CHF'], ['QAR', 'QAR'], ['SAR', 'SAR'], ['OMR', 'OMR'], ['KWD', 'KWD'], ['BHD', 'BHD'], ['ZAR', 'ZAR'], ['NZD', 'NZD'], ['CAD', 'CAD'], ['C$', 'CAD'], ['VND', 'VND'], ['PHP', 'PHP'], ['₱', 'PHP']
];
const SYMBOL_PATTERN = CURRENCY_SYMBOLS.map(([s]) => s.replace(/[.$]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|');
const CODE_OF = new Map(CURRENCY_SYMBOLS.map(([s, c]) => [s.toLowerCase(), c]));
const NUMBER = '\\d{1,3}(?:[,\\s]\\d{2,3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?';
const BEFORE = new RegExp(`(?<![A-Za-z])(${SYMBOL_PATTERN})\\s?(${NUMBER})(?:\\s?(k|lakhs?|lacs?)\\b)?`, 'gi');
const AFTER = new RegExp(`(${NUMBER})\\s?(INR|USD|EUR|GBP|AED|THB|IDR|MYR|SGD|LKR|NPR|MVR|JPY|AUD|CHF|QAR|SAR|OMR|KWD|BHD|ZAR|NZD|CAD|VND|PHP)\\b`, 'g');

const toNumber = (digits, suffix) => {
  let n = Number(String(digits).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  const s = String(suffix || '').toLowerCase();
  if (s === 'k') n *= 1000;
  else if (s.startsWith('lakh') || s.startsWith('lac')) n *= 100000;
  return n;
};

/**
 * Every amount of money in a piece of text, with where it was found: [{ currency, amount, index, text }]. An amount needs a currency
 * sign or code next to it, so a year or a room number is never taken for a price.
 */
export const findAmounts = (text) => {
  const out = [];
  const source = String(text ?? '');
  for (const m of source.matchAll(BEFORE)) {
    const amount = toNumber(m[2], m[3]);
    const currency = CODE_OF.get(m[1].toLowerCase());
    if (amount !== null && currency && amount > 0 && amount <= 100_000_000) out.push({ currency, amount, index: m.index, text: m[0] });
  }
  for (const m of source.matchAll(AFTER)) {
    const amount = toNumber(m[1]);
    if (amount !== null && amount > 0 && amount <= 100_000_000) out.push({ currency: m[2], amount, index: m.index, text: m[0] });
  }
  return out.sort((a, b) => a.index - b.index);
};

const RS_SIGNS = { '₹': 'INR', $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };

/** schema.org priceRange: "$$", "₹₹₹", "₹5,000 - ₹9,000", "5000-9000 INR" -> { currency, from, to, level }, or null. */
export const parsePriceRange = (value) => {
  const text = squash(value);
  if (!text) return null;
  const amounts = findAmounts(text);
  if (amounts.length) {
    const nums = amounts.map((a) => a.amount);
    return { currency: amounts[0].currency, from: Math.min(...nums), to: Math.max(...nums), level: 0 };
  }
  const bare = /(\d[\d,]*)\s*[-–to]+\s*(\d[\d,]*)/.exec(text);
  if (bare) return { currency: '', from: Number(bare[1].replace(/,/g, '')), to: Number(bare[2].replace(/,/g, '')), level: 0 };
  const signs = /^([₹$€£¥])\1{0,3}$/.exec(text);
  if (signs) return { currency: RS_SIGNS[signs[1]] || '', from: 0, to: 0, level: text.length };
  return null;
};

/** What a hotel calls itself in a page title: "Taj Lake Palace, Udaipur | Official Site" -> "Taj Lake Palace". */
export const nameFromTitle = (title) => {
  const text = squash(title);
  if (!text) return '';
  const parts = text.split(/\s*(?:\||–|—|:{2}|·|•|\s-\s)\s*/).map((p) => p.trim()).filter(Boolean);
  const generic = /^(?:home(?:page)?|welcome(?:\s+to)?|official(?:\s+(?:site|website))?|book(?:\s+now)?|best\s+.*|luxury\s+hotels?\s+in\s+.*|hotels?\s+in\s+.*|top\s+.*|index|untitled)$/i;
  const chosen = parts.find((p) => !generic.test(p)) || parts[0] || '';
  return chosen.replace(/^welcome\s+to\s+/i, '').replace(/\s*,\s*[^,]{2,40}$/, (tail) => (/\b(?:hotel|resort|palace|inn|lodge|villa|suites?)\b/i.test(chosen.replace(tail, '')) ? '' : tail)).slice(0, 150).trim();
};
