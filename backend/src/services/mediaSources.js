// Every collection whose records can point at a stored photo. Add a model here when a new screen starts using photos:
// the clean-up (npm run media-cleanup) only deletes photos that none of these mention.
export const getMediaSources = async () => {
  const { default: Itinerary } = await import('../models/Itinerary.js');
  return [
    // The itinerary's own gallery and the photos of each day.
    { model: Itinerary, select: 'photos days.photos' }
  ];
};
