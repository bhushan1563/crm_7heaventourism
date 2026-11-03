import { tableHasData, tableTotal } from './quotationPriceTables.js';
import { optionTotal, optionUsesRates } from './hotelRates.js';

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
 * @param {unknown} priceTableIndex which pricing option the client accepted (required when a hotel quotation has several filled in)
 * @returns {{ ok: true, quote: object, optionName: string, totalAmount: number } | { ok: false, message: string }}
 *   `quote` is the copy to keep. A chosen hotel option's hotels replace the quotation's hotels and a chosen pricing option is the
 *   only one kept; the others are left out: the confirmation shows what was bought, not what was offered. The amount is that of
 *   the pricing option when there is one, else of the hotel option, else the price of the quotation.
 */
export const confirmationFromQuotation = (quotation, optionIndex, priceTableIndex) => {
  const options = Array.isArray(quotation.options) ? quotation.options : [];
  const quote = Object.fromEntries(Object.entries(quotation).filter(([key]) => !DROPPED.includes(key)));
  let optionName = '';
  let totalAmount = round2(quotation.pricing?.grandTotal);

  if (options.length > 0) {
    const index = optionNumber(optionIndex);
    if (index === null) return { ok: false, message: `This quotation offers ${options.length} hotel options. Please choose the option the client accepted.` };
    if (index < 0 || index >= options.length) return { ok: false, message: `Please choose one of the ${options.length} hotel options.` };

    const option = options[index];
    // The total is stored as the browser sent it; a client that sent none still gets the price per person times the guests.
    // An option priced by the rate tables of its hotels has the Grand Total the tables give (each hotel keeps its table in the copy).
    const byTables = optionUsesRates(option);
    const total = byTables ? optionTotal(option) : Number(option.totalPrice) > 0 ? round2(option.totalPrice) : round2((Number(option.pricePerPerson) || 0) * guestCount(quotation.paxDetails));
    quote.options = [];
    quote.packageDetails = { ...(quotation.packageDetails || {}), hotels: option.hotels || [] };
    quote.pricing = {
      ...(quotation.pricing || {}),
      items: [],
      packageCostPerPerson: 0,
      airfareCostPerPerson: 0,
      otherCostPerPerson: 0,
      totalCostPerPerson: byTables ? 0 : round2(option.pricePerPerson),
      totalCostNote: byTables ? 'Grand Total as per the rates of the hotels above' : `${rs(option.pricePerPerson)} ${option.priceNote || 'Per person'}`,
      grandTotal: total
    };
    optionName = option.name || `Option ${index + 1}`;
    totalAmount = total;
  }

  // A hotel quotation priced with the pricing tables: the option the client accepted is the one kept, and its Grand Total is the amount.
  const tables = quotation.quotationType === 'Only Hotel' && Array.isArray(quotation.priceTables) ? quotation.priceTables : [];
  const filledIn = tables.map((table, i) => i).filter((i) => tableHasData(tables[i]));
  if (filledIn.length > 0) {
    let chosen = filledIn[0];
    if (filledIn.length > 1) {
      const index = optionNumber(priceTableIndex);
      if (index === null) return { ok: false, message: `This quotation has ${filledIn.length} pricing options. Please choose the one the client accepted.` };
      if (!filledIn.includes(index)) return { ok: false, message: `Please choose one of the ${filledIn.length} pricing options.` };
      chosen = index;
    }
    const table = tables[chosen];
    totalAmount = tableTotal(table);
    quote.priceTables = [table];
    quote.pricing = { ...(quote.pricing || quotation.pricing || {}), items: [], totalCostNote: rs(totalAmount), grandTotal: totalAmount };
    optionName = [optionName, table.name].filter(Boolean).join(' · ');
  }

  return { ok: true, quote, optionName, totalAmount };
};
