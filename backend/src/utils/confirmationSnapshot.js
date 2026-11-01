// Turning a quotation into the frozen copy a confirmation keeps. Pure logic (no database), so it can be tested exhaustively.

// What a confirmation does not carry over: database bookkeeping, the audit fields (the confirmation has its own) and the lock.
const DROPPED = ['_id', '__v', 'createdAt', 'updatedAt', 'deleted', 'createdBy', 'createdByName', 'isLocked', 'confirmationId', 'confirmationNo'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;

/** How many guests the price is for: the first number in "3 Adults + 1 Child" (the rule the pricing tab uses), else 1. */
const guestCount = (paxDetails) => {
  const match = String(paxDetails || '').match(/\d+/);
  return match ? Math.max(1, parseInt(match[0], 10)) : 1;
};

/** The option number sent by the browser (a number, or the digits of one), or null. */
const optionNumber = (value) => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{1,3}$/.test(value.trim())) return Number(value.trim());
  return null;
};

/**
 * @param {object} quotation the quotation as a plain object (`doc.toObject()`)
 * @param {unknown} optionIndex which hotel option the client accepted (required when the quotation offers options)
 * @returns {{ ok: true, quote: object, optionName: string, totalAmount: number } | { ok: false, message: string }}
 *   `quote` is the copy to keep. When an option was chosen, its hotels replace the quotation's hotels, its price becomes the
 *   price, and the other options are left out: the confirmation shows what was bought, not what was offered.
 */
export const confirmationFromQuotation = (quotation, optionIndex) => {
  const options = Array.isArray(quotation.options) ? quotation.options : [];
  const quote = Object.fromEntries(Object.entries(quotation).filter(([key]) => !DROPPED.includes(key)));

  if (options.length === 0) {
    return { ok: true, quote, optionName: '', totalAmount: round2(quotation.pricing?.grandTotal) };
  }

  const index = optionNumber(optionIndex);
  if (index === null) return { ok: false, message: `This quotation offers ${options.length} hotel options. Please choose the option the client accepted.` };
  if (index < 0 || index >= options.length) return { ok: false, message: `Please choose one of the ${options.length} hotel options.` };

  const option = options[index];
  // The total is stored as the browser sent it; a client that sent none still gets the price per person times the guests.
  const total = Number(option.totalPrice) > 0 ? round2(option.totalPrice) : round2((Number(option.pricePerPerson) || 0) * guestCount(quotation.paxDetails));
  quote.options = [];
  quote.packageDetails = { ...(quotation.packageDetails || {}), hotels: option.hotels || [] };
  quote.pricing = {
    ...(quotation.pricing || {}),
    items: [],
    packageCostPerPerson: 0,
    airfareCostPerPerson: 0,
    otherCostPerPerson: 0,
    totalCostPerPerson: round2(option.pricePerPerson),
    totalCostNote: `${rs(option.pricePerPerson)} ${option.priceNote || 'Per person'}`,
    grandTotal: total
  };
  return { ok: true, quote, optionName: option.name || `Option ${index + 1}`, totalAmount: total };
};
