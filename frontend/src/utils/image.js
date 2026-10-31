// Prepares a profile photo in the browser: centre-crop to a square, shrink, re-encode as JPEG.
// A 10 MB phone photo becomes ~15-30 KB, so it is quick to upload and cheap to store with the user record.

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_SIZE = 256;
const MAX_OUTPUT_CHARS = 120000; // the server accepts up to 150000

const loadImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file); // honours the photo's EXIF rotation
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const fileToAvatarDataUrl = async (file) => {
  if (!file) throw new Error('Please choose a photo.');
  if (!AVATAR_TYPES.includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP photo.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That photo is larger than 10 MB. Please choose a smaller one.');

  const image = await loadImage(file);
  const side = Math.min(image.width, image.height);
  if (!side) throw new Error('That file could not be read as an image.');

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  context.fillStyle = '#FFFFFF'; // JPEG has no transparency
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  if (typeof image.close === 'function') image.close();

  for (const quality of [0.88, 0.78, 0.68, 0.55]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_OUTPUT_CHARS) return dataUrl;
  }
  throw new Error('That photo could not be shrunk enough. Please choose a different one.');
};
