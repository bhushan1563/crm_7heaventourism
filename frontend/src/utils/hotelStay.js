// Using a hotel from the hotel list inside a quotation. Pure functions (no network, no React) so every rule can be tested.
// The stay gets a COPY of what the hotel showed at that moment: editing the hotel later never changes a quotation that was
// already made, and the stay can be adjusted freely.
import { formatDuration } from './itinerary';

export const STAY_LIMITS = { photos: 6, amenities: 40, roomOptions: 30 };

const DEFAULT_MEAL_PLAN = 'CP (Breakfast Only)';

/** A blank stay, the way the builder starts one by hand. */
export const blankStay = () => ({
  nights: '1 Night',
  city: '',
  hotelName: '',
  starRating: '4 star',
  roomCategory: 'Deluxe Room',
  mealPlan: DEFAULT_MEAL_PLAN,
  checkInDate: '',
  checkOutDate: '',
  noOfRooms: '1 Room',
  address: '',
  contactNumber: '',
  contactPerson: '',
  email: '',
  notes: ''
});

/** The address as printed under a hotel: the address, then the city, unless the address already names the city. */
export const addressLine = (stay) => {
  const address = String(stay?.address || '').trim();
  const city = String(stay?.city || '').trim();
  if (!city || address.toLowerCase().includes(city.toLowerCase())) return address || city;
  return [address, city].filter(Boolean).join(', ');
};

const DAY = 86400000;
const dayNumber = (value) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY : null;
};

/** The nights between two dates (YYYY-MM-DD, or saved ISO text): 0 when a date is missing or the check-out is not after the check-in. */
export const nightsBetween = (checkIn, checkOut) => {
  const from = dayNumber(checkIn);
  const to = dayNumber(checkOut);
  return from === null || to === null || to <= from ? 0 : Math.round(to - from);
};

export const nightsText = (n) => `${n} ${n === 1 ? 'Night' : 'Nights'}`;

/**
 * What changes in a stay when one of its dates is typed: the date, and the nights too once both dates make sense (the nights
 * are still editable by hand afterwards). Until then the nights stay as they were.
 */
export const stayDatePatch = (stay, key, value) => {
  const nights = nightsBetween(key === 'checkInDate' ? value : stay.checkInDate, key === 'checkOutDate' ? value : stay.checkOutDate);
  return nights > 0 ? { [key]: value, nights: nightsText(nights) } : { [key]: value };
};

/**
 * The stay with the hotel's details filled in. What belongs to this particular booking (dates, nights, number of rooms,
 * notes) is kept from `current`; what belongs to the hotel is taken from the hotel.
 */
export const stayFromHotel = (hotel, current = blankStay()) => {
  const rooms = (hotel.roomTypes || []).map((r) => r.name).filter(Boolean).slice(0, STAY_LIMITS.roomOptions);
  const plans = hotel.mealPlans || [];
  return {
    ...current,
    hotelId: hotel._id,
    hotelName: hotel.name,
    city: hotel.city,
    starRating: hotel.starRating || 'Unrated',
    address: hotel.address || hotel.area || '',
    contactNumber: hotel.phone || '',
    contactPerson: hotel.contactPerson || '',
    email: hotel.email || '',
    photos: (hotel.photos || []).slice(0, STAY_LIMITS.photos).map(({ token, width, height, caption }) => ({ token, width, height, caption: caption || '' })),
    amenities: (hotel.amenities || []).slice(0, STAY_LIMITS.amenities),
    roomOptions: rooms,
    // Keep the room the user already chose if the hotel has it; otherwise start from the hotel's first room type.
    roomCategory: rooms.length && !rooms.includes(current.roomCategory) ? rooms[0] : current.roomCategory || '',
    mealPlan: plans.length && !plans.includes(current.mealPlan) ? plans[0] : current.mealPlan || DEFAULT_MEAL_PLAN,
    checkInTime: hotel.checkInTime || '',
    checkOutTime: hotel.checkOutTime || ''
  };
};

/**
 * The title on top of a hotel quotation: the DESTINATION ("UBUD"), the way the client wants it; the hotel comes below it with its
 * room and address. A hotel with no city falls back to its own name, so the title is never empty.
 */
export const hotelDestination = (hotel) => String(hotel.city || '').trim().toUpperCase() || String(hotel.name || '').trim().toUpperCase();

/** What a new hotel quotation starts with when it is made straight from a hotel in the list. */
export const quotationFromHotel = (hotel) => ({
  quotationType: 'Only Hotel',
  destination: hotelDestination(hotel),
  duration: formatDuration(1),
  stay: stayFromHotel(hotel)
});

/** The titles a quotation has before anything was chosen (so choosing the first hotel may replace them). */
const PLACEHOLDER_TITLES = ['', 'LUXURY HOTEL BOOKING'];
export const isPlaceholderTitle = (title) => PLACEHOLDER_TITLES.includes(String(title || '').trim());

/**
 * A hotel quotation is made from the hotel list: every stay must be a hotel taken from it (or added to it first). Returns the
 * message to show when that is not so, or null. Other quotation types may type their hotels by hand.
 */
export const hotelQuotationProblem = (quotation) => {
  if ((quotation.quotationType || 'Package') !== 'Only Hotel') return null;
  const stays = quotation.packageDetails?.hotels || [];
  if (!stays.length) return 'A hotel quotation needs a hotel. On the "Hotel Details" tab, choose one from the hotel list (or add it there first).';
  const typed = stays.findIndex((s) => !s.hotelId);
  if (typed >= 0) return `Hotel stay ${typed + 1} was typed by hand. A hotel quotation uses hotels from the hotel list: choose it from the list, or add the hotel to the list first.`;
  return null;
};
