// Identifies an uploaded photo from its own bytes (never from the file name or the browser's claim) and reads its size.
// Only raster formats a browser can show safely are accepted: JPEG, PNG and WebP. SVG and anything else is refused,
// because an SVG can carry script.

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, from, to) => buf.toString('latin1', from, to);

const jpegSize = (buf) => {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // Standalone markers have no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = buf.readUInt16BE(i + 2);
    if (length < 2) return null;
    // Start-of-frame markers carry the dimensions (all SOFn except DHT 0xC4, JPG 0xC8 and DAC 0xCC).
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
};

const pngSize = (buf) => (buf.length >= 24 && ascii(buf, 12, 16) === 'IHDR' ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null);

const webpSize = (buf) => {
  if (buf.length < 30) return null;
  const chunk = ascii(buf, 12, 16);
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buf[20] === 0x2f) {
    const b1 = buf[21];
    const b2 = buf[22];
    const b3 = buf[23];
    const b4 = buf[24];
    return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
  }
  if (chunk === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
};

/**
 * @param {Buffer} buf
 * @returns {{ mime: 'image/jpeg'|'image/png'|'image/webp', width: number, height: number } | null}
 *   null when the bytes are not a JPEG, PNG or WebP whose dimensions can be read.
 */
export const inspectImage = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  let mime;
  let size;
  try {
    if (startsWith(buf, [0xff, 0xd8, 0xff])) {
      mime = 'image/jpeg';
      size = jpegSize(buf);
    } else if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      mime = 'image/png';
      size = pngSize(buf);
    } else if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') {
      mime = 'image/webp';
      size = webpSize(buf);
    }
  } catch {
    return null; // truncated or corrupt header
  }
  if (!mime || !size || !(size.width > 0) || !(size.height > 0)) return null;
  return { mime, width: size.width, height: size.height };
};
