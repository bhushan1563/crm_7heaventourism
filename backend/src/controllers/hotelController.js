import mongoose from 'mongoose';
import HotelModel from '../models/Hotel.js';
import { HOTEL_LIMITS, STAR_RATINGS, hotelPhotoTokens, nameKeyOf, normalizeHotelInput } from '../utils/hotelInput.js';
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
  const { __v, deleted, nameKey, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest;
};

/** Used by the ownership check on update/delete. Deleted hotels behave as if they do not exist. */
export const findHotelDocument = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return HotelModel.findOne({ _id: id, deleted: false });
};

/** Confirms every photo exists and takes its size from the database, never from the client. */
const attachPhotoSizes = async (data) => {
  const tokens = hotelPhotoTokens(data);
  if (!tokens.length) return { ok: true };
  const loaded = await loadPhotoSizes(tokens);
  if (!loaded.ok) return loaded;
  data.photos = data.photos.map((p) => ({ ...p, ...loaded.sizeOf(p.token) }));
  return { ok: true };
};

/** The message for a hotel that is already in the list (and a hint when it is only archived). */
const duplicateMessage = async (name, city, nameKey, exceptId) => {
  const other = await HotelModel.findOne({ nameKey, deleted: false, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('name city status').lean();
  if (!other) return null;
  return other.status === 'Archived'
    ? `"${other.name}" in ${other.city} is already in the hotel list, but it is archived. Open the Archived tab and restore it instead of adding it again.`
    : `"${other.name}" in ${other.city} is already in the hotel list. Search for it instead of adding it again.`;
};

const SORTS = {
  updated: { updatedAt: -1, _id: -1 },
  name: { name: 1, _id: 1 },
  city: { city: 1, name: 1, _id: 1 }
};

export const getHotels = async (req, res) => {
  try {
    const search = queryString(req.query.search);
    const city = queryString(req.query.city);
    const star = queryString(req.query.star);
    const status = queryString(req.query.status) || 'Active';
    const sort = SORTS[queryString(req.query.sort)] || SORTS.updated;
    const limit = clampInt(req.query.limit, 1, 50, 12);
    const page = clampInt(req.query.page, 1, 10000, 1);

    const filter = { deleted: false };
    if (status !== 'all') filter.status = status === 'Archived' ? 'Archived' : 'Active';
    if (city) filter.city = new RegExp(`^${escapeRegex(city.slice(0, HOTEL_LIMITS.city))}$`, 'i');
    if (star && STAR_RATINGS.includes(star)) filter.starRating = star;
    if (search) {
      const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
      filter.$or = [{ name: rx }, { city: rx }, { country: rx }, { area: rx }, { address: rx }, { tags: rx }, { amenities: rx }];
    }

    const [total, rows] = await Promise.all([
      HotelModel.countDocuments(filter),
      HotelModel.aggregate([
        { $match: filter },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          // Only what the list shows: descriptions, policies and photo lists stay in the database.
          $project: {
            name: 1,
            city: 1,
            country: 1,
            area: 1,
            starRating: 1,
            tags: 1,
            status: 1,
            phone: 1,
            email: 1,
            createdByName: 1,
            updatedByName: 1,
            createdAt: 1,
            updatedAt: 1,
            photoCount: { $size: { $ifNull: ['$photos', []] } },
            roomTypeCount: { $size: { $ifNull: ['$roomTypes', []] } },
            cover: { $arrayElemAt: [{ $ifNull: ['$photos', []] }, 0] }
          }
        }
      ]).collation({ locale: 'en', strength: 2 })
    ]);

    res.json({ success: true, data: rows, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load hotels'));
  }
};

export const getCities = async (req, res) => {
  try {
    const rows = await HotelModel.aggregate([
      { $match: { deleted: false, status: 'Active' } },
      { $group: { _id: { $toLower: '$city' }, city: { $first: '$city' }, count: { $sum: 1 } } },
      { $sort: { city: 1 } },
      { $limit: 300 }
    ]).collation({ locale: 'en', strength: 2 });
    res.json({ success: true, data: rows.map((r) => ({ city: r.city, count: r.count })) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load cities'));
  }
};

export const getHotelById = async (req, res) => {
  try {
    const doc = await findHotelDocument(req.params.id);
    if (!doc) return fail(res, 'Hotel not found. It may have been removed.');
    res.json({ success: true, data: present(doc) });
  } catch (error) {
    fail(res, friendlyMessage(error));
  }
};

export const createHotel = async (req, res) => {
  try {
    const input = normalizeHotelInput(req.body);
    if (!input.ok) return fail(res, input.message);
    const nameKey = nameKeyOf(input.data.name, input.data.city);
    const duplicate = await duplicateMessage(input.data.name, input.data.city, nameKey);
    if (duplicate) return fail(res, duplicate);
    const photos = await attachPhotoSizes(input.data);
    if (!photos.ok) return fail(res, photos.message);

    const doc = await HotelModel.create({
      ...input.data,
      nameKey,
      createdBy: String(req.user._id),
      createdByName: fullName(req.user),
      updatedBy: String(req.user._id),
      updatedByName: fullName(req.user)
    });
    res.json({ success: true, message: 'Hotel saved.', data: present(doc) });
  } catch (error) {
    // Two people adding the same hotel at the same moment: the unique index let one of them win.
    if (error?.code === 11000) return fail(res, 'This hotel was just added by someone else. Search for it in the hotel list.');
    fail(res, friendlyMessage(error, 'Failed to save the hotel'));
  }
};

export const updateHotel = async (req, res) => {
  try {
    const existing = await findHotelDocument(req.params.id);
    if (!existing) return fail(res, 'Hotel not found. It may have been removed.');

    const input = normalizeHotelInput(req.body, { partial: true });
    if (!input.ok) return fail(res, input.message);
    const photos = await attachPhotoSizes(input.data);
    if (!photos.ok) return fail(res, photos.message);

    const changes = { ...input.data };
    if (changes.name !== undefined || changes.city !== undefined) {
      changes.nameKey = nameKeyOf(changes.name ?? existing.name, changes.city ?? existing.city);
      if (changes.nameKey !== existing.nameKey) {
        const duplicate = await duplicateMessage(changes.name ?? existing.name, changes.city ?? existing.city, changes.nameKey, existing._id);
        if (duplicate) return fail(res, duplicate);
      }
    }

    // Two people editing the same hotel: the second save must not silently overwrite the first.
    const conflict = () =>
      fail(res, `This hotel was changed by ${existing.updatedByName || existing.createdByName || 'someone else'} while you were editing it. Please reload to see their changes before saving.`);
    if (req.body.updatedAt !== undefined) {
      const seen = new Date(req.body.updatedAt).getTime();
      if (!Number.isFinite(seen) || seen !== existing.updatedAt.getTime()) return conflict();
    }

    const updated = await HotelModel.findOneAndUpdate(
      { _id: existing._id, deleted: false, updatedAt: existing.updatedAt }, // the version we validated against
      { $set: { ...changes, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } },
      { new: true, runValidators: true }
    );
    if (!updated) return conflict();
    res.json({ success: true, message: 'Hotel updated.', data: present(updated) });
  } catch (error) {
    if (error?.code === 11000) return fail(res, 'Another hotel with this name in this city is already in the list.');
    fail(res, friendlyMessage(error, 'Failed to update the hotel'));
  }
};

export const deleteHotel = async (req, res) => {
  try {
    const existing = await findHotelDocument(req.params.id);
    if (!existing) return fail(res, 'Hotel not found. It may have been removed.');
    // Hidden from every screen but kept in the database; quotations that used it keep their own copy.
    await HotelModel.updateOne({ _id: existing._id }, { $set: { deleted: true, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } });
    res.json({ success: true, message: 'Hotel deleted.' });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to delete the hotel'));
  }
};
