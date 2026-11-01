import crypto from 'crypto';
import MediaModel from '../models/Media.js';
import { config } from '../config/env.js';
import { MAX_PIXELS, inspectImage } from '../utils/image.js';
import { LruCache } from '../utils/lruCache.js';
import { isAdminRole } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

// The web app shrinks every photo before upload (full <= 1600 px, preview <= 400 px), so these limits are generous
// safety nets for other clients, not the normal case.
export const MEDIA_LIMITS = {
  maxImageBytes: 2 * 1024 * 1024,
  maxThumbBytes: 300 * 1024,
  maxDimension: 5000,
  maxPixels: MAX_PIXELS,
  maxThumbDimension: 800
};

/** Which rights module an upload belongs to: you need create or update on that module to add photos to it. */
export const PURPOSE_MODULE = { hotel: 'hotels', itinerary: 'itineraries', quotation: 'quotations' };

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,40}$/;

const newToken = () => crypto.randomBytes(18).toString('base64url'); // 144 bits: cannot be guessed
const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB`;
const fail = (res, message) => res.status(200).json({ success: false, message });
const SIZE_SUM = { $add: ['$size', { $ifNull: ['$thumbSize', 0] }] };

/** What the web app stores on a record to point at a photo. */
export const toPhotoRef = (media) => ({
  token: media.token,
  width: media.width,
  height: media.height
});

const toResponse = (media) => ({
  ...toPhotoRef(media),
  url: `/media/${media.token}`,
  thumbUrl: `/media/${media.token}/thumb`,
  size: media.size,
  mime: media.mime
});

/** Bytes used by all stored photos (full size + preview) and how many there are. Reads indexes only, never the photos. */
export const getStorageUsage = async () => {
  const [row] = await MediaModel.aggregate([{ $group: { _id: null, bytes: { $sum: SIZE_SUM }, count: { $sum: 1 } } }]);
  const quotaBytes = config.mediaQuotaMb * 1048576;
  const usedBytes = row?.bytes || 0;
  return { usedBytes, quotaBytes, count: row?.count || 0, percent: Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) };
};

/** What one person has added in the last 24 hours. */
const bytesAddedToday = async (userId) => {
  const [row] = await MediaModel.aggregate([
    { $match: { createdBy: userId, createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } } },
    { $group: { _id: null, bytes: { $sum: SIZE_SUM } } }
  ]);
  return row?.bytes || 0;
};

/**
 * Runs BEFORE the upload is read: what the photo is for comes in the address (/api/media?purpose=hotel), so someone without
 * rights is turned away without their file ever being accepted into memory.
 */
export const requireMediaRights = (req, res, next) => {
  const purpose = typeof req.query?.purpose === 'string' ? req.query.purpose : '';
  if (!Object.hasOwn(PURPOSE_MODULE, purpose)) return fail(res, 'Unknown upload type. Please reload the page and try again.');
  req.mediaPurpose = purpose;
  if (isAdminRole(req.user.role)) return next();
  const rights = req.userRights?.[PURPOSE_MODULE[purpose]];
  if (rights && (rights.canCreate || rights.canUpdate)) return next();
  return fail(res, `Permission Denied: You do not have rights to add photos to ${PURPOSE_MODULE[purpose]}.`);
};

// Uploads are handled one at a time inside this process, so two photos arriving together cannot both squeeze under the
// storage limit. (A second process, e.g. on a serverless host, is covered by the re-check after saving.)
let uploadQueue = Promise.resolve();
const oneAtATime = (task) => {
  const result = uploadQueue.then(task, task);
  uploadQueue = result.catch(() => {});
  return result;
};

/** Why an image cannot be used, in plain language; null when it is fine. */
const imageProblem = (info, bytes, { thumb = false } = {}) => {
  if (!info) return thumb ? 'The preview image is not valid. Please try uploading the photo again.' : 'This file is not a usable photo. Please use a JPG, PNG or WebP image.';
  if (!info.complete) return thumb ? 'The preview image is incomplete. Please try uploading the photo again.' : 'This photo looks incomplete or damaged (the upload may have been interrupted). Please choose it again.';
  if (thumb) {
    return bytes > MEDIA_LIMITS.maxThumbBytes || Math.max(info.width, info.height) > MEDIA_LIMITS.maxThumbDimension ? 'The preview image is not valid. Please try uploading the photo again.' : null;
  }
  if (info.width > MEDIA_LIMITS.maxDimension || info.height > MEDIA_LIMITS.maxDimension || info.width * info.height > MEDIA_LIMITS.maxPixels) {
    return `This photo is too large (${info.width} x ${info.height} pixels). It can have at most ${MEDIA_LIMITS.maxPixels / 1_000_000} megapixels and ${MEDIA_LIMITS.maxDimension} pixels on a side.`;
  }
  if (bytes > MEDIA_LIMITS.maxImageBytes) return `This photo is ${mb(bytes)}; the limit is ${mb(MEDIA_LIMITS.maxImageBytes)}. Please use a smaller photo.`;
  return null;
};

export const uploadMedia = async (req, res) => {
  try {
    const file = req.files?.image?.[0];
    const thumbFile = req.files?.thumb?.[0];
    if (!file) return fail(res, 'Please choose a photo to upload.');

    const info = inspectImage(file.buffer);
    const problem = imageProblem(info, file.size);
    if (problem) return fail(res, problem);

    let thumb = null;
    if (thumbFile) {
      const thumbInfo = inspectImage(thumbFile.buffer);
      const thumbProblem = imageProblem(thumbInfo, thumbFile.size, { thumb: true });
      if (thumbProblem) return fail(res, thumbProblem);
      thumb = { data: thumbFile.buffer, mime: thumbInfo.mime, size: thumbFile.size };
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    await oneAtATime(() => storePhoto({ req, res, file, thumb, info, sha256 }));
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to upload the photo'));
  }
};

const storePhoto = async ({ req, res, file, thumb, info, sha256 }) => {
  try {
    const userId = String(req.user._id);

    // The same photo uploaded again (another hotel, a duplicate click) is stored once.
    const existing = await MediaModel.findOne({ sha256 }).select('token mime width height size thumbSize createdBy');
    if (existing) {
      const patch = { lastUsedAt: new Date() }; // it is in use again: the clean-up must not remove it while it is being attached
      // A preview is only added by whoever first uploaded the photo, and only if it still fits the storage limit.
      if (thumb && !existing.thumbSize && existing.createdBy === userId) {
        const used = await getStorageUsage();
        if (used.usedBytes + thumb.size <= used.quotaBytes) Object.assign(patch, { thumb: thumb.data, thumbMime: thumb.mime, thumbSize: thumb.size });
      }
      await MediaModel.updateOne({ _id: existing._id }, { $set: patch });
      return res.status(200).json({ success: true, message: 'Photo added.', data: toResponse(existing) });
    }

    const incoming = file.size + (thumb ? thumb.size : 0);

    const dailyLimit = config.mediaUserDailyMb * 1048576;
    const today = await bytesAddedToday(userId);
    if (today + incoming > dailyLimit) {
      return fail(res, `You have already added ${mb(today)} of photos in the last 24 hours (the limit is ${mb(dailyLimit)}). Please try again tomorrow, or ask your administrator to raise the limit.`);
    }

    const usage = await getStorageUsage();
    if (usage.usedBytes + incoming > usage.quotaBytes) {
      return fail(res, `Photo storage is full (${mb(usage.usedBytes)} of ${mb(usage.quotaBytes)} used). Please remove photos you no longer need, or ask your administrator to increase the storage limit.`);
    }

    let created;
    try {
      created = await MediaModel.create({
        token: newToken(),
        mime: info.mime,
        width: info.width,
        height: info.height,
        size: file.size,
        sha256,
        purpose: req.mediaPurpose,
        data: file.buffer,
        ...(thumb ? { thumb: thumb.data, thumbMime: thumb.mime, thumbSize: thumb.size } : {}),
        createdBy: userId,
        createdByName: `${req.user.firstName} ${req.user.lastName}`.trim()
      });
    } catch (error) {
      // Someone uploaded the very same photo at the very same moment: the unique index let one of us win, so use theirs.
      if (error?.code !== 11000) throw error;
      created = await MediaModel.findOne({ sha256 }).select('token mime width height size thumbSize');
      if (!created) throw error;
    }

    const after = await getStorageUsage();
    if (after.usedBytes > after.quotaBytes) {
      await MediaModel.deleteOne({ _id: created._id }); // another process got in first: take this one back out
      return fail(res, `Photo storage is full (${mb(after.usedBytes - incoming)} of ${mb(after.quotaBytes)} used). Please remove photos you no longer need, or ask your administrator to increase the storage limit.`);
    }

    res.status(200).json({ success: true, message: 'Photo added.', data: toResponse(created) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to upload the photo'));
  }
};

export const getMediaUsage = async (req, res) => {
  try {
    res.json({ success: true, data: await getStorageUsage() });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to read the photo storage usage'));
  }
};

const binary = (value) => (Buffer.isBuffer(value) ? value : value?.buffer ? Buffer.from(value.buffer) : null);

// The busiest photos stay in memory, so repeated requests for them (a page of thumbnails, a PDF being built) never reach
// the database. 40 MB is plenty for the photos in everyday use and small next to the server's memory.
const photoCache = new LruCache(40 * 1024 * 1024);

/**
 * Public photo URL (/media/<token> and /media/<token>/thumb). The unguessable token is the access control, which is what
 * lets a plain <img>, a PDF render and a Word export all fetch it. A photo never changes, so it is cached for a year and
 * a repeat request is answered from the ETag without touching the database.
 */
export const serveMedia = (variant) => async (req, res) => {
  const { token } = req.params;
  const notFound = () => res.status(404).type('text/plain').send('Photo not found');
  if (!TOKEN_PATTERN.test(token)) return notFound();

  const etag = `"${token}-${variant}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  const send = ({ body, mime }) => {
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', body.length);
    res.setHeader('Content-Disposition', 'inline');
    // Opened directly in a tab it can show the picture and nothing else.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.end(body);
  };

  const cacheKey = `${token}:${variant}`;
  const cached = photoCache.get(cacheKey);
  if (cached) return send(cached);

  try {
    const media = await MediaModel.findOne({ token })
      .select(variant === 'thumb' ? '+thumb mime thumbMime' : '+data mime')
      .lean();
    const missing = () => {
      res.removeHeader('ETag');
      res.setHeader('Cache-Control', 'no-store'); // do not let a missing photo stick in caches
      return notFound();
    };
    if (!media) return missing();

    let mime = media.mime;
    let body = null;
    if (variant === 'thumb') {
      body = binary(media.thumb);
      if (body) {
        mime = media.thumbMime || media.mime;
      } else {
        // No preview was stored for this photo: serve the full one instead.
        body = binary((await MediaModel.findOne({ token }).select('+data').lean())?.data);
      }
    } else {
      body = binary(media.data);
    }
    if (!body) return missing();

    const entry = { body, mime };
    photoCache.set(cacheKey, entry, body.length);
    send(entry);
  } catch (error) {
    res.removeHeader('ETag');
    res.setHeader('Cache-Control', 'no-store');
    console.error('[7Heaven] Failed to serve a photo:', error.message);
    res.status(500).type('text/plain').send('Could not load the photo');
  }
};
