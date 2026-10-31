// Every collection whose records can point at a stored photo. Add a model here when a new screen starts using photos:
// the clean-up (npm run media-cleanup) only deletes photos that none of these mention.
export const getMediaSources = async () => [
  // Filled in as the modules that use photos are added (itineraries, hotels, quotations).
];
