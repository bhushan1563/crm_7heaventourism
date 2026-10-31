import mongoose from 'mongoose';

// One stored photo. The bytes live here (Atlas) so there is a single place to back up and no files on the server.
// `data` and `thumb` are never selected by default: list queries and records that merely reference a photo stay small.
const mediaSchema = new mongoose.Schema(
  {
    // Unguessable public name: the photo URL is /media/<token>. Knowing it is the only way to fetch the photo.
    token: { type: String, required: true, unique: true, index: true },
    mime: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    size: { type: Number, required: true }, // bytes of `data`
    thumbMime: { type: String, default: '' },
    thumbSize: { type: Number, default: 0 },
    sha256: { type: String, required: true, index: true }, // same photo uploaded twice is stored once
    purpose: { type: String, enum: ['hotel', 'itinerary', 'quotation'], required: true },
    data: { type: Buffer, required: true, select: false },
    thumb: { type: Buffer, select: false },
    createdBy: { type: String, required: true },
    createdByName: { type: String, default: '' }
  },
  { timestamps: true }
);

mediaSchema.index({ createdAt: -1 });

export const MediaModel = mongoose.model('Media', mediaSchema);
export default MediaModel;
