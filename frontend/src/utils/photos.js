// Prepares photos in the browser before they are uploaded: a phone photo of 4-8 MB becomes a ~200 KB picture for the
// document plus a ~25 KB preview for lists. This keeps uploads fast and the database (Atlas free tier) small.
import { loadImage } from './image';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_INPUT_BYTES = 25 * 1024 * 1024; // refuse absurd files before decoding them
export const FULL_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;
// The server accepts up to 2 MB / 300 KB; stay comfortably below.
const FULL_BUDGET = 1.6 * 1024 * 1024;
const THUMB_BUDGET = 220 * 1024;

/** Scale to fit inside a max x max box, keeping the shape, never enlarging. */
export const fitWithin = (width, height, max) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

/** Why a chosen file cannot be used, in plain language; null when it is acceptable. */
export const photoProblem = (file) => {
  if (!file) return 'Please choose a photo.';
  if (!PHOTO_TYPES.includes(file.type)) return `"${file.name}" is not a JPG, PNG or WebP photo.`;
  if (file.size > MAX_PHOTO_INPUT_BYTES) return `"${file.name}" is larger than 25 MB. Please choose a smaller photo.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  return null;
};

const toBlob = (canvas, quality) =>
  new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be prepared.'))), 'image/jpeg', quality));

const encode = async (image, maxSide, budget) => {
  let side = maxSide;
  for (let shrink = 0; shrink < 4; shrink += 1) {
    const { width, height } = fitWithin(image.width, image.height, side);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF'; // JPEG has no transparency
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    for (const quality of [0.85, 0.75, 0.65, 0.5]) {
      const blob = await toBlob(canvas, quality);
      if (blob.size <= budget) return { blob, width, height };
    }
    side = Math.round(side * 0.8); // still too heavy: make it smaller and try again
  }
  throw new Error('This photo could not be made small enough. Please choose a different one.');
};

/** @returns {Promise<{ full: Blob, thumb: Blob, width: number, height: number }>} */
export const preparePhoto = async (file) => {
  const problem = photoProblem(file);
  if (problem) throw new Error(problem);
  let image;
  try {
    image = await loadImage(file);
  } catch {
    throw new Error(`"${file.name}" could not be read as a photo. It may be damaged.`);
  }
  if (!image.width || !image.height) throw new Error(`"${file.name}" could not be read as a photo.`);
  try {
    const full = await encode(image, FULL_MAX_SIDE, FULL_BUDGET);
    const thumb = await encode(image, THUMB_MAX_SIDE, THUMB_BUDGET);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    if (typeof image.close === 'function') image.close();
  }
};
