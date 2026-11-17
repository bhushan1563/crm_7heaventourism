// The lines of the per-person price list ("Pricing Breakdown": Package Price, Airfare, Other and the add-ons) as a quotation prints them.
// One place, so the page, the PDF and the Word file always say the same. Pure functions (no React, no network).

const amount = (value) => Number(value) || 0;

/**
 * What the price list prints.
 *  - A component that is included in the total prints with its price. A line with no name and no price is left out (an untouched row).
 *  - A component marked "Excluded / Optional" is not added to the total, but if it has a price it prints as an optional extra: the person
 *    typed it so the client sees it, and hiding it would make it look as if it had been lost.
 *  - `extrasOnly` (a quotation with hotel options, where each option carries its own package price): only the components on top of the
 *    package price print (Airfare, Other, add-ons), and only those with a price.
 * @returns {{ name: string, cost: number, note: string, optional: boolean }[]}
 */
export const priceListLines = (pricing, { extrasOnly = false } = {}) => {
  const items = Array.isArray(pricing?.items) ? pricing.items : [];
  return items
    .filter((item) => item && typeof item === 'object' && !(extrasOnly && item.id === 'pkg'))
    .map((item) => ({ name: String(item.name ?? '').trim(), cost: amount(item.costPerPerson), note: String(item.note ?? ''), optional: item.isIncluded === false }))
    .filter((line) => (line.optional || extrasOnly ? line.cost > 0 : Boolean(line.name) || line.cost > 0));
};

/** What follows the price of a line that is an optional extra, so nobody reads it as part of the total. */
export const OPTIONAL_MARK = '(optional, not in the total)';
