import mongoose from 'mongoose';
import ItineraryModel from '../models/Itinerary.js';
import { LIMITS, normalizeItineraryInput, photoTokensOf } from '../utils/itineraryInput.js';
import { loadPhotoSizes } from '../services/photoRefs.js';
import { escapeRegex, queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

const fail = (res, message) => res.status(200).json({ success: false, message });
const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** The record as the web app receives it. */
const present = (doc) => {
  const { __v, deleted, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest;
};

/** Used by the ownership check on update/delete. Deleted itineraries behave as if they do not exist. */
export const findItineraryDocument = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return ItineraryModel.findOne({ _id: id, deleted: false });
};

/** Confirms every photo of the itinerary exists and takes the size from the database, never from the client. */
const attachPhotoSizes = async (data) => {
  const tokens = photoTokensOf(data);
  if (!tokens.length) return { ok: true };
  const loaded = await loadPhotoSizes(tokens);
  if (!loaded.ok) return loaded;
  const withSize = (p) => ({ ...p, ...loaded.sizeOf(p.token) });
  if (data.photos) data.photos = data.photos.map(withSize);
  if (data.days) data.days = data.days.map((d) => ({ ...d, photos: d.photos.map(withSize) }));
  return { ok: true };
};

const SORTS = {
  updated: { updatedAt: -1, _id: -1 },
  title: { title: 1, _id: 1 },
  destination: { destination: 1, title: 1, _id: 1 }
};

export const getItineraries = async (req, res) => {
  try {
    const search = queryString(req.query.search);
    const destination = queryString(req.query.destination);
    const status = queryString(req.query.status) || 'Active';
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 1, 50, 20);
    const sort = SORTS[queryString(req.query.sort)] || SORTS.updated;

    const filter = { deleted: false };
    if (status !== 'all') filter.status = status === 'Archived' ? 'Archived' : 'Active';
    if (destination) filter.destination = new RegExp(`^${escapeRegex(destination.slice(0, LIMITS.destination))}$`, 'i');
    if (search) {
      const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
      filter.$or = [{ title: rx }, { destination: rx }, { country: rx }, { tags: rx }];
    }

    const [total, rows] = await Promise.all([
      ItineraryModel.countDocuments(filter),
      ItineraryModel.aggregate([
        { $match: filter },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          // Only what the list shows: the (large) day texts and photo lists stay in the database.
          $project: {
            title: 1,
            destination: 1,
            country: 1,
            nights: 1,
            tags: 1,
            status: 1,
            createdByName: 1,
            updatedByName: 1,
            createdAt: 1,
            updatedAt: 1,
            dayCount: { $size: { $ifNull: ['$days', []] } },
            photoCount: {
              $add: [
                { $size: { $ifNull: ['$photos', []] } },
                { $sum: { $map: { input: { $ifNull: ['$days', []] }, as: 'd', in: { $size: { $ifNull: ['$$d.photos', []] } } } } }
              ]
            },
            // The cover is the gallery's first photo, or else the first photo of any day.
            cover: {
              $ifNull: [
                { $arrayElemAt: [{ $ifNull: ['$photos', []] }, 0] },
                {
                  $arrayElemAt: [
                    {
                      $reduce: {
                        input: { $ifNull: ['$days.photos', []] },
                        initialValue: [],
                        in: { $concatArrays: ['$$value', { $ifNull: ['$$this', []] }] }
                      }
                    },
                    0
                  ]
                }
              ]
            }
          }
        }
      ])
    ]);

    res.json({ success: true, data: rows, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load itineraries'));
  }
};

export const getDestinations = async (req, res) => {
  try {
    const rows = await ItineraryModel.aggregate([
      { $match: { deleted: false, status: 'Active' } },
      { $group: { _id: '$destination', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 300 }
    ]);
    res.json({ success: true, data: rows.map((r) => ({ destination: r._id, count: r.count })) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load destinations'));
  }
};

export const getItineraryById = async (req, res) => {
  try {
    const doc = await findItineraryDocument(req.params.id);
    if (!doc) return fail(res, 'Itinerary not found. It may have been removed.');
    res.json({ success: true, data: present(doc) });
  } catch (error) {
    fail(res, friendlyMessage(error));
  }
};

export const createItinerary = async (req, res) => {
  try {
    const input = normalizeItineraryInput(req.body);
    if (!input.ok) return fail(res, input.message);
    const photos = await attachPhotoSizes(input.data);
    if (!photos.ok) return fail(res, photos.message);

    const doc = await ItineraryModel.create({
      ...input.data,
      createdBy: String(req.user._id),
      createdByName: fullName(req.user),
      updatedBy: String(req.user._id),
      updatedByName: fullName(req.user)
    });
    res.json({ success: true, message: 'Itinerary saved.', data: present(doc) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to save the itinerary'));
  }
};

export const updateItinerary = async (req, res) => {
  try {
    const existing = await findItineraryDocument(req.params.id);
    if (!existing) return fail(res, 'Itinerary not found. It may have been removed.');

    const input = normalizeItineraryInput(req.body, { partial: true });
    if (!input.ok) return fail(res, input.message);
    const photos = await attachPhotoSizes(input.data);
    if (!photos.ok) return fail(res, photos.message);

    // Two people editing the same itinerary: the second save must not silently overwrite the first.
    const conflict = () =>
      fail(res, `This itinerary was changed by ${existing.updatedByName || existing.createdByName || 'someone else'} while you were editing it. Please reload to see their changes before saving.`);
    if (req.body.updatedAt !== undefined) {
      const seen = new Date(req.body.updatedAt).getTime();
      if (!Number.isFinite(seen) || seen !== existing.updatedAt.getTime()) return conflict();
    }

    const updated = await ItineraryModel.findOneAndUpdate(
      { _id: existing._id, deleted: false, updatedAt: existing.updatedAt }, // the version we validated against
      { $set: { ...input.data, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } },
      { new: true, runValidators: true }
    );
    if (!updated) return conflict();
    res.json({ success: true, message: 'Itinerary updated.', data: present(updated) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to update the itinerary'));
  }
};

export const duplicateItinerary = async (req, res) => {
  try {
    const source = await findItineraryDocument(req.params.id);
    if (!source) return fail(res, 'Itinerary not found. It may have been removed.');
    const { _id, createdAt, updatedAt, __v, deleted, ...content } = source.toObject();
    const copy = await ItineraryModel.create({
      ...content,
      title: `Copy of ${content.title}`.slice(0, LIMITS.title),
      status: 'Active',
      createdBy: String(req.user._id),
      createdByName: fullName(req.user),
      updatedBy: String(req.user._id),
      updatedByName: fullName(req.user)
    });
    res.json({ success: true, message: 'A copy was created.', data: present(copy) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to copy the itinerary'));
  }
};

export const deleteItinerary = async (req, res) => {
  try {
    const existing = await findItineraryDocument(req.params.id);
    if (!existing) return fail(res, 'Itinerary not found. It may have been removed.');
    await ItineraryModel.updateOne({ _id: existing._id }, { $set: { deleted: true, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } });
    res.json({ success: true, message: 'Itinerary deleted.' });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to delete the itinerary'));
  }
};
