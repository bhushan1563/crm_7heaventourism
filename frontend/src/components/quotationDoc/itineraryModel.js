// An itinerary of the library, described the way the quotation document's pages read a trip. Pure functions (no React, no network).
import { documentFacts } from '../../utils/itineraryDoc';
import { buildModel } from './model';

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const itineraryAsQuotation = (itinerary, company) => {
  const facts = documentFacts(itinerary);
  const place = String(itinerary.destination || '').trim();
  const country = String(itinerary.country || '').trim();
  return {
    quotationType: 'Package',
    destination: place ? (country && !same(place, country) ? `${place}, ${country}` : place) : country || facts.title,
    duration: Number(itinerary.nights) > 0 ? facts.duration : '1 Day',
    companyDetails: company,
    coverPhoto: itinerary.photos?.[0] || null,
    itinerary: (itinerary.days || []).map((d) => ({ title: d.title, description: d.description, stay: d.stay, meals: d.meals, photos: d.photos || [] })),
    packageDetails: { hotels: [], inclusions: itinerary.inclusions || [] }
  };
};

/** The document's facts for an itinerary: no guest, no trip ID and no dates; the itinerary's own title stands under the destination. */
export const itineraryModel = (itinerary, quotation) => {
  const model = buildModel(quotation);
  const { title } = documentFacts(itinerary);
  return {
    ...model,
    library: true,
    noPlace: !String(itinerary.destination || '').trim() && !String(itinerary.country || '').trim(), // the title then stands in as the big name
    kicker: 'A journey to',
    subtitle: same(title, model.place) ? '' : title,
    footerLabel: `${(model.place || 'Your').toUpperCase()} ITINERARY`
  };
};
