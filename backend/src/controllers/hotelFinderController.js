import mongoose from 'mongoose';
import FoundHotelModel from '../models/FoundHotel.js';
import { config } from '../config/env.js';
import { findFromText, findHotel } from '../services/hotelFinder/finder.js';
import { parseTarget } from '../services/hotelFinder/addressGuard.js';
import { readImageTicket, signImageTicket } from '../services/hotelFinder/imageToken.js';
import { readUrl } from '../services/hotelFinder/webReader.js';
import { loadPhotoSizes } from '../services/photoRefs.js';
import { foundNameKey, foundPhotoTokens, normalizeFoundInput } from '../utils/foundHotelInput.js';
import { inspectImage } from '../utils/image.js';
import { LruCache } from '../utils/lruCache.js';
import { escapeRegex, queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

const fail = (res, message, extra = {}) => res.status(200).json({ success: false, message, ...extra });
const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const FINDER_API = {
  maxRunning: 4, // finds running at once on the whole server
  cacheSeconds: 600, // the same address asked again within ten minutes is answered from memory
  imageBytes: 6 * 1024 * 1024,
  imagePixels: 30_000_000,
  bodyChars: 400_000
};

// ---- who may run a find, and how many at once ----

const running = new Set(); // user ids with a find in progress (one at a time each)
const gate = (userId) => {
  if (running.has(userId)) return 'You already have a search running. Wait for it to finish, then try again.';
  if (running.size >= FINDER_API.maxRunning) return 'The hotel finder is busy with other searches. Please try again in a few seconds.';
  running.add(userId);
  return null;
};
const release = (userId) => running.delete(userId);

// ---- memory of recent finds ----

const cache = new LruCache(8 * 1024 * 1024);
const cached = (key) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > FINDER_API.cacheSeconds * 1000) return null;
  return JSON.parse(hit.json);
};
const remember = (key, data) => {
  const json = JSON.stringify(data);
  cache.set(key, { at: Date.now(), json }, json.length);
};

/** The find as the web app receives it: every picture also gets a signed address on our own server to show it through. */
const present = (data) => {
  let referer = '';
  try {
    referer = data.sourceUrl ? new URL(data.sourceUrl).origin : '';
  } catch { /* none */ }
  return {
    ...data,
    hotel: {
      ...data.hotel,
      images: data.hotel.images.map((image) => ({ ...image, preview: `/finder-image/${signImageTicket({ url: image.url, referer }, config.jwtSecret)}` }))
    }
  };
};

const sendFind = (res, result) => (result.ok ? res.json({ success: true, data: present(result.data) }) : fail(res, result.message, { code: result.code, canPaste: Boolean(result.canPaste) }));

/** POST /api/hotel-finder/find { url, fresh? } */
export const find = async (req, res) => {
  const userId = String(req.user._id);
  const target = parseTarget(req.body?.url, { allowPrivate: config.finderAllowPrivate });
  if (!target.ok) return fail(res, target.message, { code: target.code, canPaste: false });
  const key = `${target.url}|${config.finderAllowPrivate}`;
  if (req.body?.fresh !== true) {
    const hit = cached(key);
    if (hit) return sendFind(res, { ok: true, data: { ...hit, fromMemory: true } });
  }
  const busy = gate(userId);
  if (busy) return fail(res, busy, { code: 'BUSY', canPaste: false });
  try {
    const result = await findHotel(target.url, { allowPrivate: config.finderAllowPrivate });
    if (result.ok) remember(key, result.data);
    return sendFind(res, result);
  } catch (error) {
    // The finder reports every expected trouble itself; anything else is a fault, which is logged and shown in plain words.
    console.error('Hotel finder fault:', error?.message);
    return fail(res, 'Something went wrong while reading that website. Please try again, or paste the page\'s text instead.', { code: 'FAULT', canPaste: true });
  } finally {
    release(userId);
  }
};

/** POST /api/hotel-finder/find-text { text, url? } */
export const findText = async (req, res) => {
  const userId = String(req.user._id);
  const text = req.body?.text;
  if (typeof text === 'string' && text.length > FINDER_API.bodyChars * 2) return fail(res, 'That text is too long. Copy just the hotel\'s page, not a whole book.', { code: 'TEXT_TOO_LONG' });
  const busy = gate(userId);
  if (busy) return fail(res, busy, { code: 'BUSY' });
  try {
    return sendFind(res, findFromText(text, { url: typeof req.body?.url === 'string' ? req.body.url : '', allowPrivate: config.finderAllowPrivate }));
  } catch (error) {
    console.error('Hotel finder fault (text):', error?.message);
    return fail(res, 'Something went wrong while reading that text. Please check it and try again.', { code: 'FAULT' });
  } finally {
    release(userId);
  }
};

// ---- the pictures the finder found ----

/** GET /finder-image/:ticket: one picture, fetched with the same safety checks as pages, and only JPEG, PNG or WebP is ever passed on. */
export const serveFinderImage = async (req, res) => {
  const ticket = readImageTicket(req.params.ticket, config.jwtSecret);
  if (!ticket.ok) return res.status(ticket.reason === 'expired' ? 410 : 404).end();
  const result = await readUrl(ticket.url, { accept: ['image'], truncate: false, maxBytes: FINDER_API.imageBytes, timeoutMs: 9000, referer: ticket.referer || undefined, allowPrivate: config.finderAllowPrivate });
  if (!result.ok) return res.status(404).end();
  const info = inspectImage(result.body);
  if (!info || !info.complete || info.width * info.height > FINDER_API.imagePixels) return res.status(404).end();
  res.set({
    'Content-Type': info.mime, // from the bytes, never from what the other site said
    'Content-Length': String(result.body.length),
    'Cache-Control': 'private, max-age=900',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  return res.end(result.body);
};

// ---- saved finds ----

const presentSaved = (doc) => {
  const { __v, deleted, nameKey, ...rest } = doc.toObject ? doc.toObject({ flattenMaps: true }) : doc;
  return rest;
};

export const findSavedDocument = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return FoundHotelModel.findOne({ _id: id, deleted: false });
};

const attachPhotoSizes = async (data) => {
  const tokens = foundPhotoTokens(data);
  if (!tokens.length) return { ok: true };
  const loaded = await loadPhotoSizes(tokens);
  if (!loaded.ok) return loaded;
  data.photos = data.photos.map((p) => ({ ...p, ...loaded.sizeOf(p.token) }));
  return { ok: true };
};

const duplicateMessage = async (nameKey, exceptId) => {
  const other = await FoundHotelModel.findOne({ nameKey, deleted: false, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('name address.locality').lean();
  if (!other) return null;
  return `"${other.name}"${other.address?.locality ? ` in ${other.address.locality}` : ''} is already saved in Found hotels. Open it from the list instead of saving it again.`;
};

const SORTS = { updated: { updatedAt: -1, _id: -1 }, name: { name: 1, _id: 1 }, found: { foundAt: -1, _id: -1 } };

export const listSaved = async (req, res) => {
  try {
    const search = queryString(req.query.search);
    const status = queryString(req.query.status);
    const sort = SORTS[queryString(req.query.sort)] || SORTS.updated;
    const limit = clampInt(req.query.limit, 1, 50, 12);
    const page = clampInt(req.query.page, 1, 10000, 1);
    const filter = { deleted: false };
    if (status === 'Saved' || status === 'Added') filter.status = status;
    if (search) {
      const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
      filter.$or = [{ name: rx }, { 'address.locality': rx }, { 'address.country': rx }, { 'address.full': rx }, { sourceSite: rx }, { tags: rx }, { amenities: rx }];
    }
    const [total, rows] = await Promise.all([
      FoundHotelModel.countDocuments(filter),
      FoundHotelModel.aggregate([
        { $match: filter },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            name: 1, propertyType: 1, starRating: 1, 'address.locality': 1, 'address.country': 1, phones: { $slice: [{ $ifNull: ['$phones', []] }, 1] }, emails: { $slice: [{ $ifNull: ['$emails', []] }, 1] },
            sourceSite: 1, source: 1, status: 1, hotelId: 1, foundAt: 1, createdByName: 1, updatedByName: 1, createdAt: 1, updatedAt: 1, 'completeness.score': 1,
            photoCount: { $size: { $ifNull: ['$photos', []] } },
            cover: { $arrayElemAt: [{ $ifNull: ['$photos', []] }, 0] }
          }
        }
      ]).collation({ locale: 'en', strength: 2 })
    ]);
    res.json({ success: true, data: rows, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load the found hotels'));
  }
};

export const getSaved = async (req, res) => {
  try {
    const doc = await findSavedDocument(req.params.id);
    if (!doc) return fail(res, 'This found hotel could not be found. It may have been removed.');
    res.json({ success: true, data: presentSaved(doc) });
  } catch (error) {
    fail(res, friendlyMessage(error));
  }
};

export const createSaved = async (req, res) => {
  try {
    const input = normalizeFoundInput(req.body);
    if (!input.ok) return fail(res, input.message);
    const nameKey = foundNameKey(input.data);
    const duplicate = await duplicateMessage(nameKey);
    if (duplicate) return fail(res, duplicate);
    const photos = await attachPhotoSizes(input.data);
    if (!photos.ok) return fail(res, photos.message);
    const doc = await FoundHotelModel.create({
      ...input.data,
      nameKey,
      status: 'Saved',
      createdBy: String(req.user._id),
      createdByName: fullName(req.user),
      updatedBy: String(req.user._id),
      updatedByName: fullName(req.user)
    });
    res.json({ success: true, message: 'Saved in Found hotels.', data: presentSaved(doc) });
  } catch (error) {
    if (error?.code === 11000) return fail(res, 'This hotel was just saved by someone else. Open it from the Found hotels list.');
    fail(res, friendlyMessage(error, 'Failed to save the found hotel'));
  }
};

export const updateSaved = async (req, res) => {
  try {
    const existing = await findSavedDocument(req.params.id);
    if (!existing) return fail(res, 'This found hotel could not be found. It may have been removed.');
    const input = normalizeFoundInput(req.body, { partial: true });
    if (!input.ok) return fail(res, input.message);
    const photos = await attachPhotoSizes(input.data);
    if (!photos.ok) return fail(res, photos.message);
    const changes = { ...input.data };
    if (changes.name !== undefined || changes.address !== undefined) {
      changes.nameKey = foundNameKey({ name: changes.name ?? existing.name, address: changes.address ?? existing.address });
      if (changes.nameKey !== existing.nameKey) {
        const duplicate = await duplicateMessage(changes.nameKey, existing._id);
        if (duplicate) return fail(res, duplicate);
      }
    }
    const conflict = () => fail(res, `This found hotel was changed by ${existing.updatedByName || existing.createdByName || 'someone else'} while you were editing it. Please reload to see their changes.`);
    if (req.body.updatedAt !== undefined) {
      const seen = new Date(req.body.updatedAt).getTime();
      if (!Number.isFinite(seen) || seen !== existing.updatedAt.getTime()) return conflict();
    }
    const updated = await FoundHotelModel.findOneAndUpdate(
      { _id: existing._id, deleted: false, updatedAt: existing.updatedAt },
      { $set: { ...changes, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } },
      { new: true, runValidators: true }
    );
    if (!updated) return conflict();
    res.json({ success: true, message: 'Found hotel updated.', data: presentSaved(updated) });
  } catch (error) {
    if (error?.code === 11000) return fail(res, 'Another found hotel with this name in this city is already saved.');
    fail(res, friendlyMessage(error, 'Failed to update the found hotel'));
  }
};

export const deleteSaved = async (req, res) => {
  try {
    const existing = await findSavedDocument(req.params.id);
    if (!existing) return fail(res, 'This found hotel could not be found. It may have been removed already.');
    // Removed from the list, kept in the database: its photos may still be used by the hotel it became.
    await FoundHotelModel.updateOne({ _id: existing._id }, { $set: { deleted: true, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } });
    res.json({ success: true, message: 'Removed from Found hotels.' });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to remove the found hotel'));
  }
};

/** POST /api/hotel-finder/saved/:id/added { hotelId }: the found hotel became a hotel of the hotel list. */
export const markAdded = async (req, res) => {
  try {
    const existing = await findSavedDocument(req.params.id);
    if (!existing) return fail(res, 'This found hotel could not be found. It may have been removed.');
    const hotelId = typeof req.body?.hotelId === 'string' ? req.body.hotelId : '';
    if (!mongoose.isValidObjectId(hotelId)) return fail(res, 'The hotel that was added could not be identified.');
    const { default: HotelModel } = await import('../models/Hotel.js');
    const hotel = await HotelModel.findOne({ _id: hotelId, deleted: false }).select('_id').lean();
    if (!hotel) return fail(res, 'That hotel is not in the hotel list.');
    existing.status = 'Added';
    existing.hotelId = hotelId;
    existing.addedAt = new Date();
    existing.updatedBy = String(req.user._id);
    existing.updatedByName = fullName(req.user);
    await existing.save();
    res.json({ success: true, message: 'Marked as added to the hotel list.', data: presentSaved(existing) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to update the found hotel'));
  }
};
