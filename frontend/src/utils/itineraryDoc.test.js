import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { documentFacts, packBlocks, photoRows, richBlocks, slugify } from './itineraryDoc';

const photo = (w, h, n = 1) => ({ token: `t${n}`.padEnd(24, 'x'), width: w, height: h });

describe('slugify', () => {
  it('makes a safe file name', () => {
    expect(slugify('Bali Honeymoon: Ubud & Seminyak')).toBe('bali-honeymoon-ubud-seminyak');
    expect(slugify('  Café / Zürich  ')).toBe('cafe-zurich');
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('日本旅行', 'trip')).toBe('trip');
    expect(slugify('')).toBe('itinerary');
    expect(slugify('x'.repeat(200))).toHaveLength(60);
  });
  it('property: only lower-case letters, digits and single dashes, never empty', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        expect(slugify(text)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      })
    );
  });
});

describe('richBlocks', () => {
  it('splits formatted text into paragraphs and lists', () => {
    const blocks = richBlocks('<p>One <strong>two</strong></p><ul><li>a</li><li>b</li></ul><ol><li>x</li></ol>');
    expect(blocks.map((b) => b.tag)).toEqual(['p', 'ul', 'ol']);
    expect(blocks[0].html).toBe('One <strong>two</strong>');
    expect(blocks[1].html).toContain('<li>a</li>');
  });
  it('turns older plain text into paragraphs, keeping line breaks', () => {
    expect(richBlocks('First\nline\n\nSecond')).toEqual([{ tag: 'p', html: 'First<br>line' }, { tag: 'p', html: 'Second' }]);
  });
  it('drops anything dangerous and handles empty values', () => {
    expect(JSON.stringify(richBlocks('<p>ok</p><script>alert(1)</script><img src=x onerror=1>'))).not.toMatch(/script|onerror|<img/);
    expect(richBlocks('')).toEqual([]);
    expect(richBlocks(undefined)).toEqual([]);
  });
});

describe('photoRows', () => {
  it('puts a very wide photo on its own row and pairs the others', () => {
    const rows = photoRows([photo(4000, 1500, 1), photo(800, 600, 2), photo(800, 600, 3), photo(800, 600, 4)]);
    expect(rows.map((r) => r.length)).toEqual([1, 2, 1]);
  });
  it('property: shares in a row add up to 1, every photo is used once, in order', () => {
    const p = fc.record({ width: fc.integer({ min: 100, max: 6000 }), height: fc.integer({ min: 100, max: 6000 }) });
    fc.assert(
      fc.property(fc.array(p, { maxLength: 12 }), fc.integer({ min: 1, max: 3 }), (photos, perRow) => {
        const list = photos.map((x, i) => ({ ...x, token: `p${i}` }));
        const rows = photoRows(list, perRow);
        for (const row of rows) {
          expect(row.length).toBeLessThanOrEqual(perRow);
          expect(row.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 9);
        }
        expect(rows.flat().map((r) => r.photo.token)).toEqual(list.map((x) => x.token));
      })
    );
  });
});

describe('packBlocks', () => {
  it('fills pages in order and starts a new one when the next block does not fit', () => {
    expect(packBlocks([{ height: 300 }, { height: 300 }, { height: 300 }, { height: 300 }], 700)).toEqual([[0, 1], [2, 3]]);
  });
  it('never leaves a heading alone at the bottom of a page', () => {
    const pages = packBlocks([{ height: 600 }, { height: 40, keepWithNext: true }, { height: 200 }], 700);
    expect(pages).toEqual([[0], [1, 2]]);
  });
  it('gives an oversized block a page of its own', () => {
    expect(packBlocks([{ height: 100 }, { height: 2000 }, { height: 100 }], 700)).toEqual([[0], [1], [2]]);
  });
  it('handles no blocks', () => {
    expect(packBlocks([], 700)).toEqual([]);
  });
  it('property: every block appears exactly once, in order, and no page overflows unless it holds a single block', () => {
    const block = fc.record({ height: fc.integer({ min: 1, max: 900 }), keepWithNext: fc.boolean() });
    fc.assert(
      fc.property(fc.array(block, { maxLength: 40 }), fc.integer({ min: 300, max: 1000 }), (blocks, capacity) => {
        const pages = packBlocks(blocks, capacity);
        expect(pages.flat()).toEqual(blocks.map((_, i) => i));
        for (const page of pages) {
          expect(page.length).toBeGreaterThan(0);
          if (page.length > 1) expect(page.reduce((s, i) => s + blocks[i].height, 0)).toBeLessThanOrEqual(capacity);
        }
        // a heading is followed by its block on the same page whenever there is one
        pages.forEach((page) => {
          const last = page[page.length - 1];
          const alone = page.length === 1;
          if (blocks[last]?.keepWithNext && last < blocks.length - 1 && !alone) {
            // allowed only when the following block could never fit beside it anyway
            expect(blocks[last].height + Math.min(blocks[last + 1].height, capacity - blocks[last].height)).toBeLessThanOrEqual(capacity);
          }
        });
      }),
      { numRuns: 1500 }
    );
  });
});

describe('documentFacts', () => {
  it('collects the heading facts the exports print', () => {
    expect(documentFacts({ title: 'Bali Escape', destination: 'Bali', country: 'Indonesia', nights: 5 })).toEqual({ title: 'Bali Escape', where: 'Bali, Indonesia', duration: '5 Nights / 6 Days', fileBase: 'bali-escape-itinerary' });
    expect(documentFacts({}).title).toBe('Itinerary');
  });
});
