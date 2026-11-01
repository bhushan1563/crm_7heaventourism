import MediaModel from '../models/Media.js';

// Photos are referenced from other records as { token: '...' }. When a record drops a photo (or is deleted) the photo itself
// stays in the database until this clean-up removes it, which keeps "remove photo" instant and undoable while editing.
//
// Safety rules, because deleting a photo that is still in use would break documents:
//  - it refuses to run without a list of the places photos are used (an empty list would make EVERY photo look unused);
//  - a photo counts as "recent" from the moment it was last handed out, not just first uploaded;
//  - the references are checked again immediately before anything is deleted.

const TOKEN_IN_JSON = /"token":"([A-Za-z0-9_-]{20,40})"/g;

/**
 * Every photo token mentioned by the given sources.
 * @param {{ model: import('mongoose').Model, select?: string }[]} sources records that may reference photos
 */
export const collectReferencedTokens = async (sources) => {
  const used = new Set();
  for (const { model, select } of sources) {
    const cursor = model.find({}).select(select || '').lean().cursor();
    for await (const doc of cursor) {
      for (const match of JSON.stringify(doc).matchAll(TOKEN_IN_JSON)) used.add(match[1]);
    }
  }
  return used;
};

const requireSources = (sources) => {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('The clean-up needs the list of places that use photos (services/mediaSources.js); with an empty list every photo would look unused.');
  }
};

const olderThan = (graceMs, now) => ({ $or: [{ lastUsedAt: { $lt: new Date(now - graceMs) } }, { lastUsedAt: { $exists: false }, createdAt: { $lt: new Date(now - graceMs) } }] });

/**
 * Photos nothing refers to any more. Photos used or uploaded within the grace period are kept: a photo is uploaded first
 * and attached when the form is saved, so a recent one may simply not be saved yet.
 */
export const findOrphans = async (sources, { graceMs = 24 * 60 * 60 * 1000, now = Date.now() } = {}) => {
  requireSources(sources);
  const used = await collectReferencedTokens(sources);
  const candidates = await MediaModel.find(olderThan(graceMs, now)).select('token size thumbSize').lean();
  return candidates.filter((m) => !used.has(m.token));
};

export const deleteOrphans = async (sources, options) => {
  const first = await findOrphans(sources, options);
  if (!first.length) return { removed: 0, freedBytes: 0 };
  // A record may have been saved with one of these photos while we were looking: check again right before deleting.
  const usedNow = await collectReferencedTokens(sources);
  const orphans = first.filter((m) => !usedNow.has(m.token));
  if (orphans.length) await MediaModel.deleteMany({ _id: { $in: orphans.map((m) => m._id) } });
  return {
    removed: orphans.length,
    freedBytes: orphans.reduce((sum, m) => sum + (m.size || 0) + (m.thumbSize || 0), 0)
  };
};
