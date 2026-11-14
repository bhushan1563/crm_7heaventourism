// The line under the company name in the header of every quotation, confirmation and PDF.
export const HEADER_TAGLINE = 'YOUR JOURNEY BEGINS HERE';

// Every quotation made before the tagline changed carries this text in its stored company details (it was the default).
const PREVIOUS_TAGLINE = 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings';

/** The tagline to print: a tagline someone typed themselves is kept; an empty one, or the previous default, becomes the current one. */
export const headerTagline = (stored) => {
  const text = String(stored ?? '').trim();
  return !text || text.toLowerCase() === PREVIOUS_TAGLINE.toLowerCase() ? HEADER_TAGLINE : text;
};
