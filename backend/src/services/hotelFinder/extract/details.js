import { attr, where } from './dom.js';
import { findAmounts, normalizeTime, starsFromText } from './normalize.js';
import { cand } from './structured.js';

// What a hotel tells its guests in words: stars, check-in and check-out times, amenities, rooms, rates, policies, a description, a
// guest rating. Read from the visible lines of the page (see dom.visibleLines). Words are less reliable than structured data, so
// these candidates carry lower confidence.

// ---- the hotel's own name, from the page's main heading ----

const GENERIC_HEADING = /^(?:home|welcome|welcome to|rooms?|about|about us|contact|contact us|gallery|offers?|menu|book now|search|login|facilities|amenities)$/i;
// Accessibility / nav UI text that sometimes appears as the page's first heading (skip links, cookie banners, toggle labels)
const NAV_HEADING = /^skip(?:\s+to(?:\s+(?:main\s+)?content)?)?(?:\s+navigation)?|^cookie\s+(?:settings?|notice|preferences?|consent|policy)|^accept(?:\s+all)?\s+cookies?|^(?:toggle|open|close)\s+(?:nav(?:igation)?|menu)|^site\s+(?:nav|navigation)|^main\s+menu|^primary\s+navigation/i;

export const headingNameCandidates = (lines) => {
  const first = lines.find((l) => l.heading);
  if (!first || first.text.length < 3 || first.text.length > 80 || GENERIC_HEADING.test(first.text) || NAV_HEADING.test(first.text) || /[.!?]$/.test(first.text)) return [];
  return [cand('name', first.text.replace(/^welcome\s+to\s+/i, ''), 'h1', 0.42)];
};

// ---- stars and kind of property ----

export const starCandidates = (doc, lines) => {
  const out = [];
  lines.slice(0, 30).forEach((line) => {
    if (!line.heading && line.text.length > 160) return;
    const s = starsFromText(line.text);
    if (s) out.push(cand('starRating', s, 'heading', line.heading ? 0.6 : 0.5));
  });
  let seen = 0;
  for (const line of lines) {
    if (seen >= 3) break;
    const s = starsFromText(line.text);
    if (s) {
      out.push(cand('starRating', s, 'text', 0.35));
      seen += 1;
    }
  }
  for (const el of where(doc, (n) => /(?:^|\s)(?:star|stars|rating)[-_]?([1-5])(?:\s|$)/i.test(attr(n, 'class'))).slice(0, 3)) {
    const m = /(?:^|\s)(?:star|stars|rating)[-_]?([1-5])(?:\s|$)/i.exec(attr(el, 'class'));
    if (m) out.push(cand('starRating', Number(m[1]), 'class', 0.3));
  }
  const head = lines.slice(0, 40).map((l) => l.text).join(' ');
  if (/\b(?:heritage|palace|haveli|fort)\b/i.test(head)) out.push(cand('propertyType', 'Heritage / Palace', 'text', 0.4));
  else if (/\b(?:resort|villas?|retreat|spa resort)\b/i.test(head)) out.push(cand('propertyType', 'Resort / Villa', 'text', 0.4));
  else if (/\b(?:bed\s*(?:&|and)\s*breakfast|homestay|guest\s*house)\b/i.test(head)) out.push(cand('propertyType', 'Guest house', 'text', 0.4));
  else if (/\bhostel\b/i.test(head)) out.push(cand('propertyType', 'Hostel', 'text', 0.4));
  return out;
};

// ---- check-in and check-out ----

const TIME = '(\\d{1,2}(?:\\s*[:.h]\\s*\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?|noon|hrs?\\.?)?)';
const CHECK_IN = new RegExp(`check[\\s-]?in\\b(?:\\s*time)?[^0-9]{0,30}?${TIME}`, 'gi');
const CHECK_OUT = new RegExp(`check[\\s-]?out\\b(?:\\s*time)?[^0-9]{0,30}?${TIME}`, 'gi');

export const timeCandidates = (lines) => {
  const out = [];
  for (const line of lines) {
    if (line.text.length > 300) continue;
    for (const m of line.text.matchAll(CHECK_IN)) {
      const t = normalizeTime(m[1].replace(/hrs?\.?$/i, ''));
      if (t) out.push(cand('checkIn', t, 'text', Number(t.slice(0, 2)) >= 10 ? 0.6 : 0.3));
    }
    for (const m of line.text.matchAll(CHECK_OUT)) {
      const t = normalizeTime(m[1].replace(/hrs?\.?$/i, ''));
      if (t) out.push(cand('checkOut', t, 'text', Number(t.slice(0, 2)) <= 15 ? 0.6 : 0.3));
    }
  }
  return out.slice(0, 12);
};

// ---- amenities ----

const AMENITIES = [
  ['Free Wi-Fi', /\b(?:free\s+)?wi-?fi\b|\bwireless internet\b/i],
  ['Swimming pool', /\b(?:swimming\s+|infinity\s+|outdoor\s+|indoor\s+)?pool\b/i],
  ['Spa', /\bspa\b|\bwellness cent(?:re|er)\b|\bayurveda\b|\bmassage\b/i],
  ['Fitness centre', /\bgym\b|\bfitness\s+(?:cent(?:re|er)|room)\b/i],
  ['Restaurant', /\brestaurants?\b|\bfine dining\b|\bmulti-?cuisine\b/i],
  ['Bar', /\b(?:cocktail\s+)?bar\b|\blounge\b|\bpub\b/i],
  ['Parking', /\b(?:free\s+|valet\s+)?parking\b|\bcar park\b/i],
  ['Airport transfer', /\bairport\s+(?:transfers?|shuttle|pick-?up)\b/i],
  ['Breakfast', /\bbreakfast\b/i],
  ['Room service', /\broom service\b|\bin-?room dining\b/i],
  ['Laundry', /\blaundry\b|\bdry[\s-]?clean/i],
  ['24-hour front desk', /\b24[\s-]?(?:hours?|hr|x\s?7)\s+(?:front\s+desk|reception)|\bfront desk\b.{0,12}24/i],
  ['Concierge', /\bconcierge\b/i],
  ['Business centre', /\bbusiness\s+cent(?:re|er)\b/i],
  ['Conference & banquet', /\b(?:conference|banquet|meeting)\s+(?:halls?|rooms?|facilities)\b|\bweddings?\b.{0,20}\bvenue\b/i],
  ['Kids club', /\bkids?(?:'s)?\s+(?:club|play\s*area|zone)\b|\bchildren(?:'s)?\s+(?:club|play)/i],
  ['Pet friendly', /\bpet[\s-]?friendly\b|\bpets?\s+(?:allowed|welcome)\b/i],
  ['Air conditioning', /\bair[\s-]?condition(?:ing|ed)\b|\ba\/c\b/i],
  ['Beach access', /\bprivate\s+beach\b|\bbeach\s+access\b|\bbeachfront\b/i],
  ['Garden', /\bgardens?\b|\blawns?\b/i],
  ['Lift', /\blifts?\b|\belevators?\b/i],
  ['Wheelchair accessible', /\bwheelchair\b|\bdisabled\s+access/i],
  ['Babysitting', /\bbaby-?sitting\b|\bchild\s*care\b/i],
  ['Safe', /\b(?:in-?room\s+)?safe\b(?!\s+(?:and|&)\s+secure)|\bsafety deposit\b/i],
  ['TV', /\b(?:flat[\s-]?screen\s+|smart\s+|satellite\s+)?tv\b|\btelevision\b/i],
  ['Minibar', /\bmini-?bar\b/i],
  ['Tea/coffee maker', /\b(?:tea|coffee)\s*(?:\/|&|and)?\s*(?:tea|coffee)?\s*mak(?:er|ing)\b|\bkettle\b/i],
  ['Balcony', /\bbalcon(?:y|ies)\b/i],
  ['Bonfire', /\bbonfire\b|\bcamp-?fire\b/i],
  ['Boat ride', /\bboat\s+(?:ride|safari|cruise)\b/i],
  ['Library', /\blibrary\b/i]
];

const JUNK_LIST = /^(?:home|about(?:\s+us)?|contact(?:\s+us)?|book(?:\s+now)?|gallery|login|sign\s?in|sign\s?up|read\s+more|view\s+more|learn\s+more|see\s+more|more|menu|search|privacy(?:\s+policy)?|terms(?:\s+(?:&|and)\s+conditions)?|cookies?|faq|blog|news|offers?|rooms?|suites?|dining|events?|careers?|sitemap|back\s+to\s+top|next|previous|close|submit|send|name|email|phone|message|check\s+availability|enquire(?:\s+now)?|view\s+all|click\s+here)$/i;
const SECTION_HEAD = /^(?:hotel\s+|property\s+|guest\s+|general\s+|room\s+)?(?:amenities|facilities|services|features|inclusions|what\s+we\s+offer|highlights|things\s+to\s+do|activities)(?:\s+(?:&|and)\s+\w+)?$/i;

export const amenityCandidates = (lines) => {
  const out = [];
  const seen = new Set();
  const add = (name, confidence, source = 'text') => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cand('amenity', name, source, confidence));
  };
  const body = lines.slice(0, 600);
  for (const [name, pattern] of AMENITIES) if (body.some((l) => l.text.length <= 400 && pattern.test(l.text))) add(name, 0.45);
  body.forEach((line, i) => {
    if (!SECTION_HEAD.test(line.text)) return;
    let taken = 0;
    for (let j = i + 1; j < Math.min(body.length, i + 45) && taken < 40; j += 1) {
      const t = body[j].text;
      if (body[j].heading && !SECTION_HEAD.test(t)) break;
      if (t.length < 3 || t.length > 45 || JUNK_LIST.test(t) || /[.!?]$/.test(t) || /^\d+$/.test(t) || /@|https?:|₹|rs\.?\s*\d/i.test(t)) continue;
      add(t.replace(/^[-•·*✓✔]+\s*/, ''), 0.55, 'list');
      taken += 1;
    }
  });
  return out.slice(0, 60);
};

// ---- rooms ----

// A room name has a kind of room in it ("Deluxe Lake View Room", "Family Suite"); a view or a grade alone ("Lakeview Homestay") does not make one.
const ROOM_WORD = /\b(?:rooms?|suites?|villas?|cottages?|cabins?|chalets?|bungalows?|tents?|studios?|penthouses?|lofts?|residences?|apartments?|dormitor(?:y|ies)|dorms?|houseboats?|havelis?)\b/i;
const ROOM_GENERIC = /^(?:rooms?(?:\s*(?:&|and)\s*(?:suites?|rates|tariff|villas?))?|our\s+(?:rooms?|suites?|accommodations?)|accommodations?|suites?(?:\s*(?:&|and)\s*villas?)?|stay|rooms?\s+(?:amenities|features|facilities|service|rates?|tariff|types?|policy)|book\s+(?:a|your)\s+(?:room|stay)|(?:luxury|best|our)\s+(?:rooms?|suites?)|room\s+details?|room\s+categories|view\s+(?:rooms?|all)|rooms?\s+available|check\s+availability|your\s+room|choose\s+your\s+room|find\s+your\s+room|room\s+booking|book\s+room)$/i;

export const roomCandidates = (lines) => {
  const out = [];
  const seen = new Set();
  const first = lines.findIndex((l) => l.heading); // the page's first heading is its title (usually the hotel's name), never a room
  lines.slice(0, 700).forEach((line, i) => {
    if (!line.heading || i === first) return;
    const name = line.text.replace(/\s*[-–|]\s*(?:from\s+)?(?:₹|rs\.?|inr|\$|€|£).*$/i, '').trim();
    if (name.length < 3 || name.length > 60 || name.split(' ').length > 8 || !ROOM_WORD.test(name) || ROOM_GENERIC.test(name) || /[.!?:]$/.test(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    const next = lines[i + 1];
    const details = next && !next.heading && next.text.length >= 15 && next.text.length <= 400 ? next.text.slice(0, 200) : '';
    seen.add(key);
    out.push(cand('room', { name, details }, 'heading', 0.5));
  });
  return out.slice(0, 30);
};

// ---- rates ----

const PER_NIGHT = /(?:per|a|each|\/)\s*(?:room\s+)?(?:per\s+)?night|nightly|\/\s*night|per\s+room|rates?\s+(?:start|from)|starting\s+(?:from|at|rate)|from\s+(?:only\s+)?(?:₹|rs|inr|\$|€|£)|onwards|tariff|room\s+rates?|price\s+from/i;
const PER_PERSON = /per\s+(?:person|pax|adult|guest)|\/\s*(?:person|pax|head)/i;
const NOT_A_RATE = /\b(?:off|discount|save|saving|deposit|refund|cashback|coupon|promo(?:code)?|wallet|points?|loyalty|membership|credits?|vouchers?|gift|bonus|rewards?|complimentary|upgrade|fee for|extra\s+(?:bed|person|adult|child))\b/i;

export const priceCandidates = (lines) => {
  const out = [];
  for (const line of lines.slice(0, 900)) {
    if (line.text.length > 400 || !PER_NIGHT.test(line.text) || NOT_A_RATE.test(line.text)) continue;
    const amounts = findAmounts(line.text);
    if (!amounts.length) continue;
    const nums = amounts.map((a) => a.amount);
    // Rates for a single night are not tiny (a few rupees is a fee, not a room) and not astronomical.
    const lowest = Math.min(...nums);
    const currency = amounts[0].currency;
    if ((currency === 'INR' && lowest < 300) || (['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD', 'CHF'].includes(currency) && lowest < 8)) continue;
    out.push(cand('price', { currency, from: lowest, to: Math.max(...nums), unit: PER_PERSON.test(line.text) ? 'person' : 'night', kind: 'text', text: line.text.slice(0, 160) }, 'text', 0.45));
    if (out.length >= 6) break;
  }
  return out;
};

// ---- policies and rating ----

export const policyCandidates = (lines) => {
  const out = [];
  lines.slice(0, 900).forEach((line, i) => {
    const t = line.text;
    if (t.length < 25 || t.length > 700) return;
    if (/cancel/i.test(t) && /(?:policy|refund|days?|hours?|charge|free)/i.test(t) && !out.some((c) => c.field === 'policy.cancellation')) {
      const next = lines[i + 1];
      const full = !line.heading ? t : next && !next.heading ? next.text : '';
      if (full.length >= 25 && /cancel/i.test(full)) out.push(cand('policy.cancellation', full.slice(0, 600), 'text', 0.45));
    }
    if (/\bchild(?:ren)?\b/i.test(t) && /(?:free|welcome|stay|extra bed|below|under|years?)/i.test(t) && !out.some((c) => c.field === 'policy.children')) out.push(cand('policy.children', t.slice(0, 300), 'text', 0.4));
    if (/\bpets?\b/i.test(t) && /(?:allowed|welcome|permitted|not\s+allowed|no\s+pets|prohibited)/i.test(t) && !out.some((c) => c.field === 'policy.pets')) out.push(cand('policy.pets', t.slice(0, 200), 'text', 0.4));
  });
  return out;
};

const RATING_TEXT = [
  /(?:rated|rating|score|scored)?\s*(\d(?:\.\d)?)\s*(?:\/|out of)\s*(5|10)\b[^.]{0,80}?(\d[\d,]*)\s+(?:guest\s+)?(?:reviews?|ratings?)/i,
  /(\d[\d,]*)\s+(?:guest\s+)?(?:reviews?|ratings?)[^.]{0,40}?(\d(?:\.\d)?)\s*(?:\/|out of)\s*(5|10)\b/i
];

export const ratingTextCandidates = (lines) => {
  for (const line of lines.slice(0, 900)) {
    if (line.text.length > 250) continue;
    const a = RATING_TEXT[0].exec(line.text);
    if (a) {
      const value = Number(a[1]);
      const best = Number(a[2]);
      if (value > 0 && value <= best) return [cand('rating', { value, best, count: Number(a[3].replace(/,/g, '')) }, 'text', 0.4)];
    }
    const b = RATING_TEXT[1].exec(line.text);
    if (b) {
      const value = Number(b[2]);
      const best = Number(b[3]);
      if (value > 0 && value <= best) return [cand('rating', { value, best, count: Number(b[1].replace(/,/g, '')) }, 'text', 0.4)];
    }
  }
  return [];
};

// ---- description ----

const NOT_DESCRIPTION = /(?:cookie|©|copyright|all rights reserved|privacy policy|terms (?:of|and)|subscribe|newsletter|sign up|log ?in|javascript|browser|powered by|designed by|enable|accept all|we use|read more|click here|book now|check availability|whatsapp)/i;

export const descriptionCandidates = (lines) => {
  const afterH1 = Math.max(0, lines.findIndex((l) => l.heading));
  const pool = lines.slice(afterH1, afterH1 + 80).filter((l) => !l.heading && l.text.length >= 120 && l.text.length <= 1200 && !NOT_DESCRIPTION.test(l.text) && /[.!?]/.test(l.text));
  const best = pool[0];
  return best ? [cand('description', best.text.slice(0, 1500), 'text', 0.4)] : [];
};
