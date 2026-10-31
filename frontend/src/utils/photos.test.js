import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_PHOTO_INPUT_BYTES, fitWithin, photoProblem } from './photos';

const file = (over = {}) => ({ name: 'beach.jpg', type: 'image/jpeg', size: 1_000_000, ...over });

describe('fitWithin', () => {
  it('shrinks the long side to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('never enlarges a small photo', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it('property: result fits the box, is never bigger than the original, keeps the shape and is never zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 100, max: 4000 }), (w, h, max) => {
        const r = fitWithin(w, h, max);
        expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(Math.max(1, Math.min(max, Math.max(w, h))) + 1);
        expect(r.width).toBeLessThanOrEqual(w);
        expect(r.height).toBeLessThanOrEqual(h);
        expect(r.width).toBeGreaterThanOrEqual(1);
        expect(r.height).toBeGreaterThanOrEqual(1);
        // Each side is the exact scaled value, give or take the rounding to whole pixels (and never below 1).
        const scale = Math.min(1, max / Math.max(w, h));
        expect(Math.abs(r.width - Math.max(1, w * scale))).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(Math.abs(r.height - Math.max(1, h * scale))).toBeLessThanOrEqual(0.5 + 1e-9);
      }),
      { numRuns: 1000 }
    );
  });
});

describe('photoProblem', () => {
  it('accepts normal photos', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(photoProblem(file({ type }))).toBeNull();
  });
  it('explains in plain words why a file cannot be used', () => {
    expect(photoProblem(null)).toMatch(/choose a photo/i);
    expect(photoProblem(file({ type: 'image/gif', name: 'x.gif' }))).toBe('"x.gif" is not a JPG, PNG or WebP photo.');
    expect(photoProblem(file({ type: 'image/svg+xml', name: 'x.svg' }))).toMatch(/not a JPG, PNG or WebP/);
    expect(photoProblem(file({ type: 'application/pdf', name: 'x.pdf' }))).toMatch(/not a JPG/);
    expect(photoProblem(file({ size: MAX_PHOTO_INPUT_BYTES + 1 }))).toMatch(/larger than 25 MB/);
    expect(photoProblem(file({ size: 0, name: 'empty.jpg' }))).toBe('"empty.jpg" is empty.');
  });
});
