import { line } from './itineraryInput.js';
import { richLine } from './quotationText.js';
import { normalizeQuotationHotels, stayPhotoTokens } from './quotationHotels.js';

// Hotel options of a quotation: several choices offered side by side, each with its own hotels and its own price.
// A quotation without options (every older one, and anything the mobile app sends today) is one offer, exactly as before.
// Pure logic (no database), so it can be tested exhaustively; the controller confirms the photos exist.

export const OPTION_LIMITS = { options: 6, name: 80, note: 200, hotelsPerOption: 10, maxPrice: 1_000_000_000 };

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const price = (raw, label) => {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 0 };
  const n = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > OPTION_LIMITS.maxPrice) return fail(`${label} must be an amount from 0 to ${OPTION_LIMITS.maxPrice.toLocaleString('en-IN')}.`);
  return { ok: true, value: Math.round(n * 100) / 100 };
};

/**
 * @param {unknown} value the `options` list a client sent
 * @returns {{ ok: true, value: object[] } | { ok: false, message: string }}
 */
export const normalizeQuotationOptions = (value) => {
  if (!Array.isArray(value)) return fail('The options must be a list.');
  const L = OPTION_LIMITS;
  if (value.length > L.options) return fail(`A quotation can offer at most ${L.options} options (there are ${value.length}).`);
  const out = [];
  let recommended = 0;
  for (const [index, raw] of value.entries()) {
    const n = index + 1;
    if (!isPlainObject(raw)) return fail(`Option ${n} is not valid.`);
    const name = line(raw.name, `the name of option ${n}`, L.name);
    if (!name.ok) return name;
    const stays = normalizeQuotationHotels(raw.hotels ?? []);
    if (!stays.ok) return { ok: false, message: `Option ${n}: ${stays.message}` };
    if (stays.value.length > L.hotelsPerOption) return fail(`Option ${n} can have at most ${L.hotelsPerOption} hotels (there are ${stays.value.length}).`);
    const perPerson = price(raw.pricePerPerson, `The price per person of option ${n}`);
    if (!perPerson.ok) return perPerson;
    const total = price(raw.totalPrice, `The total price of option ${n}`);
    if (!total.ok) return total;
    const note = richLine(raw.priceNote, `the price note of option ${n}`, L.note); // can be formatted
    if (!note.ok) return note;
    if (raw.recommended !== undefined && raw.recommended !== null && typeof raw.recommended !== 'boolean') return fail(`Whether option ${n} is recommended must be yes or no.`);
    if (raw.recommended === true) recommended += 1;
    out.push({ name: name.value || `Option ${n}`, recommended: raw.recommended === true, hotels: stays.value, pricePerPerson: perPerson.value, totalPrice: total.value, priceNote: note.value || 'Per person' });
  }
  if (recommended > 1) return fail('Only one option can be marked as recommended.');
  return { ok: true, value: out };
};

/** Every photo token the options' hotels mention (to confirm they exist). */
export const optionPhotoTokens = (options) => options.flatMap((o) => stayPhotoTokens(o.hotels));
