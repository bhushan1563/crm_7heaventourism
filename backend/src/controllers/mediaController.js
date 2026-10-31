import crypto from 'crypto';
import MediaModel from '../models/Media.js';
import { config } from '../config/env.js';
import { inspectImage } from '../utils/image.js';
import { isAdminRole } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

// The web app shrinks every photo before upload (full <= 1600 px, preview <= 400 px), so these limits are generous
// safety nets for other clients, not the normal case.
export const MEDIA_LIMITS = {
  maxImageBytes: 2 * 1024 * 1024,
  maxThumbBytes: 300 * 1024,
  maxDimension: 5000,
  maxThumbDimension: 800
};

/** Which rights module an upload belongs to: you need create or update on that module to add photos to it. */
export const PURPOSE_MODULE = { hotel: 'hotels', itinerary: 'itineraries', quotation: 'quotations' };
const PURPOSE_LABEL = { hotel: 'hotels', itinerary: 'itineraries', quotation: 'quotations' };

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,40}$/;

const newToken = () => crypto.randomBytes(18).toString('base64url'); // 144 bits: cannot be guessed
const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB`;
const fail = (res, message) => res.status(200).json({ success: false, message });

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

/** Bytes used by all stored photos (full size + preview) and how many there are. */
export const getStorageUsage = async () => {
  const [row] = await MediaModel.aggregate([
    { $group: { _id: null, bytes: { $sum: { $add: ['$size', { $ifNull: ['$thumbSize', 0] }] } }, count: { $sum: 1 } } }
  ]);
  const quotaBytes = config.mediaQuotaMb * 1048576;
  const usedBytes = row?.bytes || 0;
  return { usedBytes, quotaBytes, count: row?.count || 0, percent: Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) };
};

/** After multer: the caller needs create/update rights on the module the photo is for. */
export const requireMediaRights = (req, res, next) => {
  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose : '';
  const moduleName = PURPOSE_MODULE[purpose];
  if (!moduleName) return fail(res, 'Unknown upload type. Please reload the page and try again.');
  if (isAdminRole(req.user.role)) return next();
  const rights = req.userRights?.[moduleName];
  if (rights && (rights.canCreate || rights.canUpdate)) return next();
  return fail(res, `Permission Denied: You do not have rights to add photos to ${PURPOSE_LABEL[purpose]}.`);
};

export const uploadMedia = async (req, res) => {
  try {
    const purpose = req.body.purpose;
    const file = req.files?.image?.[0];
    const thumbFile = req.files?.thumb?.[0];

    if (!file) return fail(res, 'Please choose a photo to upload.');

    const info = inspectImage(file.buffer);
    if (!info) return fail(res, 'This file is not a usable photo. Please use a JPG, PNG or WebP image.');
    if (info.width > MEDIA_LIMITS.maxDimension || info.height > MEDIA_LIMITS.maxDimension) {
      return fail(res, `This photo is too large (${info.width} x ${info.height} pixels). The longest side can be at most ${MEDIA_LIMITS.maxDimension} pixels.`);
    }
    if (file.size > MEDIA_LIMITS.maxImageBytes) {
      return fail(res, `This photo is ${mb(file.size)}; the limit is ${mb(MEDIA_LIMITS.maxImageBytes)}. Please use a smaller photo.`);
    }

    let thumb = null;
    if (thumbFile) {
      const thumbInfo = inspectImage(thumbFile.buffer);
      if (!thumbInfo || thumbFile.size > MEDIA_LIMITS.maxThumbBytes || Math.max(thumbInfo.width, thumbInfo.height) > MEDIA_LIMITS.maxThumbDimension) {
        return fail(res, 'The preview image is not valid. Please try uploading the photo again.');
      }
      thumb = { data: thumbFile.buffer, mime: thumbInfo.mime, size: thumbFile.size };
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // The same photo uploaded again (another hotel, a duplicate click) is stored once.
    const existing = await MediaModel.findOne({ sha256 }).select('token mime width height size thumbSize');
    if (existing) {
      if (thumb && !existing.thumbSize) {
        await MediaModel.updateOne({ _id: existing._id }, { thumb: thumb.data, thumbMime: thumb.mime, thumbSize: thumb.size });
      }
      return res.status(200).json({ success: true, message: 'Photo added.', data: toResponse(existing) });
    }

    const usage = await getStorageUsage();
    const incoming = file.size + (thumb ? thumb.size : 0);
    if (usage.usedBytes + incoming > usage.quotaBytes) {
      return fail(
        res,
        `Photo storage is full (${mb(usage.usedBytes)} of ${mb(usage.quotaBytes)} used). Please remove photos you no longer need, or ask your administrator to increase the storage limit.`
      );
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
        purpose,
        data: file.buffer,
        ...(thumb ? { thumb: thumb.data, thumbMime: thumb.mime, thumbSize: thumb.size } : {}),
        createdBy: String(req.user._id),
        createdByName: `${req.user.firstName} ${req.user.lastName}`.trim()
      });
    } catch (error) {
      // Someone uploaded the very same photo at the very same moment: the unique index let one of us win, so use theirs.
      if (error?.code !== 11000) throw error;
      created = await MediaModel.findOne({ sha256 }).select('token mime width height size thumbSize');
      if (!created) throw error;
    }

    res.status(200).json({ success: true, message: 'Photo added.', data: toResponse(created) });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to upload the photo') });
  }
};

export const getMediaUsage = async (req, res) => {
  try {
    res.json({ success: true, data: await getStorageUsage() });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to read the photo storage usage') });
  }
};

const binary = (value) => (Buffer.isBuffer(value) ? value : value?.buffer ? Buffer.from(value.buffer) : null);

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

  try {
    const media = await MediaModel.findOne({ token })
      .select(variant === 'thumb' ? '+thumb mime thumbMime' : '+data mime')
      .lean();
    if (!media) {
      res.removeHeader('ETag');
      res.setHeader('Cache-Control', 'no-store'); // do not let a missing photo stick in caches
      return notFound();
    }

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
    if (!body) {
      res.removeHeader('ETag');
      res.setHeader('Cache-Control', 'no-store');
      return notFound();
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', body.length);
    res.setHeader('Content-Disposition', 'inline');
    // Opened directly in a tab it can show the picture and nothing else.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.end(body);
  } catch (error) {
    res.removeHeader('ETag');
    res.setHeader('Cache-Control', 'no-store');
    console.error('[7Heaven] Failed to serve a photo:', error.message);
    res.status(500).type('text/plain').send('Could not load the photo');
  }
};
