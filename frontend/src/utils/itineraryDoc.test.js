import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { dayMeta, documentFacts, photoRows, richBlocks, slugify } from './itineraryDoc';

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

describe('dayMeta', () => {
  it('shows the overnight stay and the meals with a visible separator, or nothing', () => {
    expect(dayMeta({ stay: 'Ubud', meals: 'Dinner' })).toBe('Overnight: Ubud  •  Meals: Dinner');
    expect(dayMeta({ stay: 'Ubud', meals: '' })).toBe('Overnight: Ubud');
    expect(dayMeta({ stay: '', meals: 'Breakfast, Dinner' })).toBe('Meals: Breakfast, Dinner');
    expect(dayMeta({})).toBe('');
  });
});

describe('documentFacts', () => {
  it('collects the heading facts the exports print', () => {
    expect(documentFacts({ title: 'Bali Escape', destination: 'Bali', country: 'Indonesia', nights: 5 })).toEqual({ title: 'Bali Escape', where: 'Bali, Indonesia', duration: '5 Nights / 6 Days', fileBase: 'bali-escape-itinerary' });
    expect(documentFacts({}).title).toBe('Itinerary');
  });
});
