// The line under the company name in the header of every quotation, confirmation and PDF: the products and services on a quotation, and
// "Your journey begins here" on a booking confirmation.
export const PRODUCTS_TAGLINE = 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings';
export const CONFIRMATION_TAGLINE = 'YOUR JOURNEY BEGINS HERE';

/**
 * The tagline to print. A tagline someone typed themselves is kept on both. The two standard lines (and an empty one) are not typed text:
 * they are stored on every quotation as its default, so each document prints its own, whichever of them is stored.
 */
export const headerTagline = (stored, confirmation = false) => {
  const text = String(stored ?? '').trim();
  const standard = !text || [PRODUCTS_TAGLINE, CONFIRMATION_TAGLINE].some((line) => line.toLowerCase() === text.toLowerCase());
  if (!standard) return text;
  return confirmation ? CONFIRMATION_TAGLINE : PRODUCTS_TAGLINE;
};
