import MediaModel from '../models/Media.js';

/**
 * Records point at photos by token. Before a record is saved, confirm that every token exists (a forged or stale token must
 * never be stored) and read each photo's real size from the database, never from the client.
 * @param {string[]} tokens
 * @returns {Promise<{ ok: true, sizeOf: (token: string) => { width: number, height: number } } | { ok: false, message: string }>}
 */
export const loadPhotoSizes = async (tokens) => {
  const unique = [...new Set(tokens)];
  const found = unique.length ? await MediaModel.find({ token: { $in: unique } }).select('token width height').lean() : [];
  const byToken = new Map(found.map((m) => [m.token, m]));
  const missing = unique.filter((t) => !byToken.has(t));
  if (missing.length) {
    return {
      ok: false,
      message: missing.length === 1
        ? 'One of the photos is no longer available. Please remove it and add it again.'
        : `${missing.length} of the photos are no longer available. Please remove them and add them again.`
    };
  }
  return { ok: true, sizeOf: (token) => ({ width: byToken.get(token).width, height: byToken.get(token).height }) };
};
