// Every collection whose records can point at a stored photo. Add a model here when a new screen starts using photos:
// the clean-up (npm run media-cleanup) only deletes photos that none of these mention.
export const getMediaSources = async () => {
  const { default: Itinerary } = await import('../models/Itinerary.js');
  const { default: Quotation } = await import('../models/Quotation.js');
  const { default: Hotel } = await import('../models/Hotel.js');
  return [
    // The itinerary's own gallery and the photos of each day.
    { model: Itinerary, select: 'photos days.photos' },
    // The photos on the days of a quotation and on its hotel stays (copied in from the libraries or added there).
    { model: Quotation, select: 'itinerary.photos packageDetails.hotels.photos' },
    // The photo gallery of each hotel in the hotel list.
    { model: Hotel, select: 'photos' }
  ];
};
