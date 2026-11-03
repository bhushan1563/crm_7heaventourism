// Hotel options of a quotation: several choices offered side by side, each with its own hotels and its own price.
// Pure functions (no network, no React) so every rule can be tested. A quotation with no options is one offer, as before.

export const OPTION_LIMITS = { options: 6, hotelsPerOption: 10 };

/** How many guests the price is for: the first number in "3 Adults + 1 Child" (the same rule the pricing tab uses), else 1. */
export const guestCount = (paxDetails) => {
  const match = String(paxDetails || '').match(/\d+/);
  return match ? Math.max(1, parseInt(match[0], 10)) : 1;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const blankOption = (number) => ({ name: `Option ${number}`, recommended: false, hotels: [], pricePerPerson: 0, totalPrice: 0, priceNote: 'Per person' });

/** The total is always the price per person times the guests: it is shown, never typed, so it can never disagree. */
export const repriceOptions = (options, paxDetails) => {
  const guests = guestCount(paxDetails);
  return (options || []).map((o) => ({ ...o, totalPrice: round2(o.pricePerPerson * guests) }));
};

export const setPrice = (options, index, pricePerPerson, paxDetails) =>
  repriceOptions(options.map((o, i) => (i === index ? { ...o, pricePerPerson: Math.max(0, round2(pricePerPerson)) } : o)), paxDetails);

/** Start offering options: the hotels the quotation already has become Option 1, and a blank Option 2 is ready. */
export const startOptions = (stays) => [{ ...blankOption(1), hotels: (stays || []).map((s) => ({ ...s })) }, blankOption(2)];

/** Go back to a single offer: the first option's hotels become the quotation's hotels. */
export const hotelsOfFirstOption = (options) => (options?.[0]?.hotels || []).map((s) => ({ ...s }));

/** Marking one option as recommended un-marks the others (only one can be recommended). */
export const setRecommended = (options, index, on) => options.map((o, i) => ({ ...o, recommended: i === index ? on : on ? false : o.recommended }));

export const addOption = (options) => (options.length >= OPTION_LIMITS.options ? options : [...options, blankOption(options.length + 1)]);

export const duplicateOption = (options, index) => {
  if (options.length >= OPTION_LIMITS.options || !options[index]) return options;
  const source = options[index];
  const copy = { ...source, name: `${source.name} (copy)`.slice(0, 80), recommended: false, hotels: source.hotels.map((s) => ({ ...s })) };
  return [...options.slice(0, index + 1), copy, ...options.slice(index + 1)];
};

export const removeOption = (options, index) => options.filter((_, i) => i !== index);

export const moveOption = (options, from, to) => {
  if (to < 0 || to >= options.length || from === to) return options;
  const next = [...options];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/** Index of the option with the lowest price per person (ignoring options that have no price yet), or -1. */
export const cheapestIndex = (options) => {
  let best = -1;
  options.forEach((o, i) => {
    if (o.pricePerPerson > 0 && (best < 0 || o.pricePerPerson < options[best].pricePerPerson)) best = i;
  });
  return best;
};

/**
 * What stops a quotation with options from being saved, in plain words, or null. A hotel quotation ("Only Hotel") must use
 * hotels from the hotel list, in every option.
 */
export const optionsProblem = (quotation) => {
  const options = quotation.options || [];
  if (!options.length) return null;
  if (options.length < 2) return 'To offer hotel options, add at least two. Or go back to a single offer.';
  const fromList = (quotation.quotationType || 'Package') === 'Only Hotel';
  for (const [i, option] of options.entries()) {
    const label = `Option ${i + 1}${option.name && option.name !== `Option ${i + 1}` ? ` (${option.name})` : ''}`;
    if (!option.hotels?.length) return `${label} has no hotel yet. Choose one from the hotel list, or remove the option.`;
    if (fromList) {
      const typed = option.hotels.findIndex((s) => !s.hotelId);
      if (typed >= 0) return `${label}, hotel ${typed + 1} was typed by hand. A hotel quotation uses hotels from the hotel list: choose it from the list, or add the hotel to the list first.`;
    }
    if (!(option.pricePerPerson > 0)) return `Please enter the price per person of ${label}.`;
  }
  return null;
};

/**
 * What a new hotel quotation starts with: two options (Option 1, Option 2), the usual way to show a 3 star and a 4 star choice side
 * by side, each able to take several hotels and each with its own price. The hotels the quotation already has become Option 1.
 * A quotation that already has options is left exactly as it is.
 */
export const startHotelOptions = (quotation) =>
  (quotation?.options || []).length
    ? {}
    : { options: repriceOptions(startOptions(quotation?.packageDetails?.hotels || []), quotation?.paxDetails), packageDetails: { ...(quotation?.packageDetails || {}), hotels: [] } };
