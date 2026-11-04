import { richToPlainText } from './richText';
// The price line printed in the yellow box of a quotation ("Rs 43,000 Per person (Incl of GST)"). It follows the total price
// automatically, but only while nobody has written their own: a line that was typed or formatted by hand is never overwritten.

export const autoPriceNote = (perPerson) => `Rs ${(Number(perPerson) || 0).toLocaleString('en-IN')} Per person (Incl of GST)`;

/**
 * The price line after the price changed from `previousPerPerson` to `nextPerPerson`.
 * @param {string} current what the quotation holds now
 */
export const nextPriceNote = (current, previousPerPerson, nextPerPerson) => {
  const text = typeof current === 'string' ? current.trim() : '';
  const isAutomatic = !text || text === autoPriceNote(previousPerPerson) || text === autoPriceNote(0);
  return isAutomatic ? autoPriceNote(nextPerPerson) : current;
};

const AUTOMATIC = /^Rs\s*([\d,]+(?:\.\d+)?)\s+Per person \(Incl of GST\)$/i;

/**
 * The price line to print. A line that only repeats the price ("Rs 0 Per person (Incl of GST)", the default every quotation is saved with,
 * including those imported from the old CSV export) must agree with the real price: when it does not, it is replaced by the real one.
 * A line somebody wrote or formatted themselves is always kept as it is.
 */
export const shownPriceNote = (pricing) => {
  const per = Number(pricing?.totalCostPerPerson) || 0;
  const grand = Number(pricing?.grandTotal) || 0;
  const text = richToPlainText(pricing?.totalCostNote || '').trim();
  const automatic = AUTOMATIC.exec(text);
  const amount = automatic ? Number(automatic[1].replace(/,/g, '')) : null;
  const stale = automatic && (amount === 0 || amount !== per);
  if (text && !stale) return pricing.totalCostNote;
  if (per > 0) return autoPriceNote(per);
  if (grand > 0) return `Rs ${grand.toLocaleString('en-IN')} Total (Incl of GST)`;
  return 'Custom Rate on Request';
};
