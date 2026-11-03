// Shared logic for the hotel screens: the empty form, the checks that run before saving (the server repeats them) and the
// choices offered. No React in here, so it is easy to test. The limits match the server's (backend/src/utils/hotelInput.js).
// Room types and meal plans are no longer entered on the hotel form. The form does not send them, so a hotel that already has
// them keeps them (the server leaves what a request does not mention as it was) and a stay taken from it still offers them.
export const HOTEL_LIMITS = {
  name: 150,
  city: 100,
  country: 80,
  area: 100,
  address: 300,
  description: 5000,
  contactPerson: 100,
  phone: 40,
  email: 120,
  website: 200,
  amenities: 40,
  amenityLength: 40,
  policy: 1500,
  notes: 1500,
  tags: 10,
  tagLength: 30,
  photos: 30
};

export const STAR_OPTIONS = [
  { value: '5 star', label: '5 Star Luxury' },
  { value: '4 star', label: '4 Star Premium' },
  { value: '3 star', label: '3 Star Deluxe' },
  { value: '2 star', label: '2 Star Standard' },
  { value: 'Heritage / Palace', label: 'Heritage / Palace' },
  { value: 'Resort / Villa', label: 'Resort / Villa' },
  { value: 'Unrated', label: 'Not rated' }
];
export const starLabel = (value) => STAR_OPTIONS.find((s) => s.value === value)?.label || value || 'Not rated';

/** Rules for the amenity tag box (kept as typed, up to 40 of them). */
export const AMENITY_RULES = { max: HOTEL_LIMITS.amenities, maxLength: HOTEL_LIMITS.amenityLength, lower: false, noun: 'amenity', plural: 'amenities', owner: 'A hotel' };
/** Rules for the tag box (lower case, up to 10). */
export const HOTEL_TAG_RULES = { max: HOTEL_LIMITS.tags, maxLength: HOTEL_LIMITS.tagLength, lower: true, noun: 'tag', plural: 'tags', owner: 'A hotel' };

/** One-click suggestions for the amenity box. */
export const AMENITY_SUGGESTIONS = ['Swimming pool', 'Free WiFi', 'Spa', 'Restaurant', 'Bar', 'Gym', 'Airport transfer', 'Parking', 'Beach access', 'Room service', 'Kids club', 'Air conditioning'];

export const emptyHotel = () => ({
  name: '',
  city: '',
  country: '',
  area: '',
  address: '',
  starRating: 'Unrated',
  description: '',
  photos: [],
  contactPerson: '',
  phone: '',
  email: '',
  website: '',
  checkInTime: '14:00',
  checkOutTime: '11:00',
  amenities: [],
  cancellationPolicy: '',
  notes: '',
  tags: [],
  status: 'Active'
});

/** The form as the server wants it (no editor-only fields). */
export const toPayload = (form) => ({
  name: form.name,
  city: form.city,
  country: form.country,
  area: form.area,
  address: form.address,
  starRating: form.starRating,
  description: form.description,
  photos: form.photos.map(({ token, caption }) => ({ token, caption: caption || '' })),
  contactPerson: form.contactPerson,
  phone: form.phone,
  email: form.email,
  website: form.website,
  checkInTime: form.checkInTime,
  checkOutTime: form.checkOutTime,
  amenities: form.amenities,
  cancellationPolicy: form.cancellationPolicy,
  notes: form.notes,
  tags: form.tags,
  status: form.status
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-().\s]{5,40}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** A web address as typed: with or without https://. Returns the cleaned address, or null when it is not one. */
export const cleanWebsite = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
};

/**
 * Problems found before saving, keyed so the screen can show each one next to its field.
 * Keys: name, city, phone, email, website, checkInTime, checkOutTime.
 */
export const validateHotel = (form) => {
  const L = HOTEL_LIMITS;
  const errors = {};
  const name = form.name.trim();
  const city = form.city.trim();
  if (!name) errors.name = 'Please enter the name of the hotel.';
  else if (name.length > L.name) errors.name = `The name is too long (${name.length} characters; the limit is ${L.name}).`;
  if (!city) errors.city = 'Please enter the city.';
  else if (city.length > L.city) errors.city = `The city is too long (the limit is ${L.city} characters).`;

  const phone = form.phone.trim();
  if (phone && !PHONE.test(phone)) errors.phone = 'The phone number may only contain digits, spaces and + - ( ) . characters (5 to 40 of them).';
  const email = form.email.trim();
  if (email && !EMAIL.test(email)) errors.email = 'The email address does not look right. Please check it.';
  else if (email.length > L.email) errors.email = `The email address is too long (the limit is ${L.email} characters).`;
  if (form.website.trim() && cleanWebsite(form.website) === null) errors.website = 'The website address does not look right. Example: https://www.example.com';

  if (!TIME.test(form.checkInTime)) errors.checkInTime = 'The check-in time must be a time like 14:00.';
  if (!TIME.test(form.checkOutTime)) errors.checkOutTime = 'The check-out time must be a time like 11:00.';
  return errors;
};

/** Which field to show first when several things are wrong. */
export const firstErrorKey = (errors) => {
  for (const key of ['name', 'city', 'phone', 'email', 'website', 'checkInTime', 'checkOutTime']) if (errors[key]) return key;
  return null;
};
