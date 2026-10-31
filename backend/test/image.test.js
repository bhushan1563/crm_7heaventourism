import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { inspectImage } from '../src/utils/image.js';

// Builders for minimal, valid file headers (the rest of the file does not need to decode).
const jpeg = (w, h, { before = Buffer.alloc(0), marker = 0xc0 } = {}) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    before,
    Buffer.from([0xff, marker, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    Buffer.from([0xff, 0xd9])
  ]);
const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const webpX = (w, h) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(22, 4);
  b.write('WEBPVP8X', 8, 'latin1');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};
const webpL = (w, h) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBPVP8L', 8, 'latin1');
  b[20] = 0x2f;
  const bits = (w - 1) | ((h - 1) << 14); // 14 + 14 bits, little endian
  b.writeUInt32LE(bits >>> 0, 21);
  return b;
};
const webpLossy = (w, h) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBPVP8 ', 8, 'latin1');
  b.writeUInt16LE(w, 26);
  b.writeUInt16LE(h, 28);
  return b;
};

test('JPEG, PNG and the three WebP flavours are recognised with their real size', () => {
  assert.deepEqual(inspectImage(jpeg(1600, 1067)), { mime: 'image/jpeg', width: 1600, height: 1067 });
  assert.deepEqual(inspectImage(png(800, 600)), { mime: 'image/png', width: 800, height: 600 });
  assert.deepEqual(inspectImage(webpX(1024, 768)), { mime: 'image/webp', width: 1024, height: 768 });
  assert.deepEqual(inspectImage(webpL(321, 123)), { mime: 'image/webp', width: 321, height: 123 });
  assert.deepEqual(inspectImage(webpLossy(500, 400)), { mime: 'image/webp', width: 500, height: 400 });
});

test('a JPEG with other segments (EXIF, thumbnails) before the frame header still reads', () => {
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x10]), Buffer.alloc(14, 1)]);
  assert.equal(inspectImage(jpeg(300, 200, { before: exif })).width, 300);
  assert.equal(inspectImage(jpeg(300, 200, { marker: 0xc2 })).height, 200, 'progressive JPEG');
});

test('anything that is not a JPEG, PNG or WebP is refused, whatever it is called', () => {
  assert.equal(inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(inspectImage(Buffer.from('GIF89a' + 'x'.repeat(40))), null);
  assert.equal(inspectImage(Buffer.from('%PDF-1.7 ' + 'x'.repeat(40))), null);
  assert.equal(inspectImage(Buffer.from('MZ' + 'x'.repeat(40))), null, 'a program');
  assert.equal(inspectImage(Buffer.alloc(0)), null);
  assert.equal(inspectImage('not a buffer'), null);
  assert.equal(inspectImage(null), null);
});

test('truncated or zero-sized images are refused', () => {
  assert.equal(inspectImage(jpeg(100, 100).subarray(0, 8)), null);
  assert.equal(inspectImage(png(100, 100).subarray(0, 18)), null);
  assert.equal(inspectImage(jpeg(0, 0)), null);
  assert.equal(inspectImage(png(0, 5)), null);
});

test('a corrupt JPEG segment length cannot make the reader loop forever', () => {
  const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x00]), Buffer.alloc(64, 0xff)]);
  assert.equal(inspectImage(corrupt), null);
});

test('property: sizes round-trip for every format', () => {
  const side = fc.integer({ min: 1, max: 16000 });
  fc.assert(
    fc.property(side, side, (w, h) => {
      assert.deepEqual(inspectImage(jpeg(Math.min(w, 65535), Math.min(h, 65535))), { mime: 'image/jpeg', width: w, height: h });
      assert.deepEqual(inspectImage(png(w, h)), { mime: 'image/png', width: w, height: h });
      assert.deepEqual(inspectImage(webpX(w, h)), { mime: 'image/webp', width: w, height: h });
    }),
    { numRuns: 400 }
  );
});

test('property: arbitrary bytes never throw and never claim to be an image unless the header says so', () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 400 }), (bytes) => {
      const result = inspectImage(Buffer.from(bytes));
      if (result) {
        assert.ok(['image/jpeg', 'image/png', 'image/webp'].includes(result.mime));
        assert.ok(result.width > 0 && result.height > 0);
      }
    }),
    { numRuns: 3000 }
  );
});

test('property: valid image headers followed by garbage stay valid; garbage in front never does', () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 300 }), (tail) => {
      assert.equal(inspectImage(Buffer.concat([png(10, 20), Buffer.from(tail)])).width, 10);
      const prefixed = Buffer.concat([Buffer.from([0x00]), png(10, 20)]);
      assert.equal(inspectImage(prefixed), null);
    }),
    { numRuns: 300 }
  );
});
