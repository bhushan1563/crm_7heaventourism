// Pictures that were COPIED (from Google Images, a web page, a screenshot, a chat, a file manager) and pasted into a photo gallery with
// Ctrl+V or the Paste button. The browser hands the picture over in different ways, and this file turns each of them into the
// ordinary photo file the gallery already knows how to prepare and upload. Pure functions where possible (no React) so every rule can
// be tested; the few that touch the network or a canvas take the browser's function as a parameter.
import { PHOTO_TYPES } from './photos';
import { loadImage } from './image';

export const MAX_PASTED_SOURCES = 10;

export const NOTHING_PASTED = 'There is no picture in what you copied. Copy a picture first (on a web page, right-click it, or touch and hold it on a phone, then choose "Copy image"), then paste again.';
export const SITE_BLOCKED = 'We could not copy that picture from its website (some sites do not allow it). Copy the picture itself (right-click it, or touch and hold it on a phone, then choose "Copy image") and paste again. Or save it and use "Add photos".';
export const CLIPBOARD_BLOCKED = 'Your browser did not let us look at what you copied. Please allow "paste" when your browser asks, and try again. (On a computer you can also click inside the photo box once and press Ctrl+V.)';

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/tiff': 'tif', 'image/svg+xml': 'svg' };
const isImageType = (type) => /^image\//i.test(String(type || ''));

/** What the clipboard holds: the picture files, and the copied web page text and plain text (for a picture copied with its page). */
export const readClipboard = (data) => {
  const files = [];
  for (const item of Array.from(data?.items || [])) {
    if (item?.kind === 'file' && isImageType(item.type)) {
      const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
      if (file) files.push(file);
    }
  }
  if (!files.length) for (const file of Array.from(data?.files || [])) if (file && isImageType(file.type)) files.push(file);
  const get = (type) => {
    try {
      return typeof data?.getData === 'function' ? String(data.getData(type) || '') : '';
    } catch {
      return '';
    }
  };
  // A picture dragged from a web page arrives as its address in "text/uri-list" (and often in "text/plain" too).
  return { files, html: get('text/html'), text: get('text/plain').trim() || get('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#')) || '' };
};

const WEB_ADDRESS = /^https?:\/\/\S+$/i; // many picture addresses (Google, CDNs) have no ".jpg" at the end, so any single address is tried

/**
 * The pictures a copied web page or a copied link points to: `{ kind: 'data', value }` for a picture carried inside the page, and
 * `{ kind: 'url', value }` for one at a web address (a copied link counts when it is one single web address). Nothing else is accepted
 * (no other kind of link, no sentence), at most MAX_PASTED_SOURCES. Whether an address really is a picture is found out when it is fetched.
 */
export const imageSources = (html, text) => {
  const found = [];
  const add = (kind, value) => {
    if (value && found.length < MAX_PASTED_SOURCES && !found.some((s) => s.value === value)) found.push({ kind, value });
  };
  if (html && typeof DOMParser !== 'undefined') {
    try {
      for (const img of new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img')) {
        const src = (img.getAttribute('src') || '').trim();
        if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(src)) add('data', src);
        else if (/^https?:\/\//i.test(src)) add('url', src);
      }
    } catch {
      /* a page that cannot be read has no pictures for us */
    }
  }
  const line = String(text || '').trim();
  if (line && WEB_ADDRESS.test(line)) add('url', line);
  return found;
};

/** The text inside a blob (the copied page the browser gives through the Paste tile). */
export const blobText = (blob) =>
  typeof blob?.text === 'function'
    ? blob.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });

/** A picture carried inside copied content ("data:image/png;base64,..."), as a file; null when it cannot be decoded. */
export const fileFromDataUrl = (dataUrl, name = 'picture') => {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  let binary;
  try {
    binary = atob(match[2].replace(/\s+/g, ''));
  } catch {
    return null;
  }
  if (!binary.length) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: match[1].toLowerCase() });
};

/**
 * A picture at a web address, as a file. Most sites do not let another website read their pictures; then (and for anything that is
 * not a picture) this says so in plain words and the person is told what to do instead.
 */
export const fileFromUrl = async (url, name = 'picture', fetchImpl = typeof fetch === 'function' ? fetch : null) => {
  if (!fetchImpl) throw new Error(SITE_BLOCKED);
  let response;
  try {
    response = await fetchImpl(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error(SITE_BLOCKED);
  }
  if (!response?.ok) throw new Error(SITE_BLOCKED);
  const blob = await response.blob();
  if (!isImageType(blob.type)) throw new Error('That link is not a picture.');
  return new File([blob], name, { type: blob.type });
};

/** A name that says what it is: a screenshot or a copied picture arrives as "image.png", the same for every one. */
export const isGenericName = (name) => !String(name || '').trim() || /^(?:image|unnamed|untitled|blob|screenshot|picture|download|pasted[ _-]?photo(?: \d+)?)(?:\s*\(\d+\))?(?:\.[a-z0-9]+)?$/i.test(String(name).trim());

export const pastedName = (type, number) => `Pasted photo ${number}.${EXTENSIONS[String(type || '').toLowerCase()] || 'png'}`;

/** Draws any picture the browser can show onto a canvas and saves it as PNG (for a GIF, an AVIF, a BMP). */
export const convertToPng = async (file) => {
  const image = await loadImage(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('That picture could not be read.'))), 'image/png'));
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.png', { type: 'image/png' });
  } finally {
    if (typeof image.close === 'function') image.close();
  }
};

/**
 * The file the gallery adds: a pasted picture in a kind the gallery accepts (JPG, PNG, WebP) is used as it is, any other kind of
 * picture is converted to PNG, and a generic name ("image.png") becomes "Pasted photo 2.png" so the tiles can be told apart.
 */
export const toPhotoFile = async (file, number, convert = convertToPng) => {
  let ready = file;
  if (!PHOTO_TYPES.includes(file.type)) {
    try {
      ready = await convert(file);
    } catch {
      throw new Error(`"${file.name || 'The picture'}" is in a kind of picture we cannot use. Please copy a JPG, PNG or WebP picture.`);
    }
  }
  return isGenericName(file.name) ? new File([ready], pastedName(ready.type, number), { type: ready.type }) : ready;
};
