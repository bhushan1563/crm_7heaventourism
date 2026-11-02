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
