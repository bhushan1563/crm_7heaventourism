import MediaModel from '../models/Media.js';

// Photos are referenced from other records as { token: '...' }. When a record drops a photo (or is deleted) the photo itself
// stays in the database until this clean-up removes it, which keeps "remove photo" instant and undoable while editing.

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

/**
 * Photos nothing refers to any more. Photos younger than the grace period are kept: a photo is uploaded first and attached
 * when the form is saved, so a recent upload may simply not be saved yet.
 */
export const findOrphans = async (sources, { graceMs = 24 * 60 * 60 * 1000, now = Date.now() } = {}) => {
  const used = await collectReferencedTokens(sources);
  const candidates = await MediaModel.find({ createdAt: { $lt: new Date(now - graceMs) } })
    .select('token size thumbSize')
    .lean();
  return candidates.filter((m) => !used.has(m.token));
};

export const deleteOrphans = async (sources, options) => {
  const orphans = await findOrphans(sources, options);
  if (orphans.length) await MediaModel.deleteMany({ _id: { $in: orphans.map((m) => m._id) } });
  return {
    removed: orphans.length,
    freedBytes: orphans.reduce((sum, m) => sum + (m.size || 0) + (m.thumbSize || 0), 0)
  };
};
