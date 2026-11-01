import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { generateItineraryDocx, toDocxColor, toHalfPoints } from './itineraryDocx';

const read = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });

const unzip = async (blob) => {
  const files = unzipSync(await read(blob));
  return { files, xml: strFromU8(files['word/document.xml']), names: Object.keys(files) };
};

// A tiny but real JPEG header + body is enough: Word embeds the bytes as they are.
const FAKE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const photo = (n, w = 1600, h = 1200, caption = '') => ({ token: String(n).padEnd(24, 'a'), width: w, height: h, caption });

const itinerary = (over = {}) => ({
  title: 'Bali Escape',
  destination: 'Bali',
  country: 'Indonesia',
  nights: 2,
  summary: '<p>A <strong>relaxing</strong> trip.</p>',
  photos: [photo(1, 1600, 900, 'Beach at sunset')],
  days: [
    {
      title: 'Arrival',
      stay: 'Ubud',
      meals: 'Dinner',
      description: '<p>Plain, <em>italic</em>, <u>underlined</u>, <span style="color:#dc2626;font-size:18px">red 18px</span>, <mark style="background-color:#fde047">marked</mark>.</p><ul><li>First</li><li>Second</li></ul><ol><li>One</li><li>Two</li></ol>',
      photos: [photo(2), photo(3)]
    },
    { title: 'Temples', stay: '', meals: '', description: 'Old plain text\nsecond line', photos: [] }
  ],
  inclusions: ['Daily <strong>breakfast</strong>', 'Airport transfers'],
  exclusions: ['Airfare'],
  ...over
});

// Every photo gets its own bytes: Word stores identical images only once, which would hide a missing photo.
const jpegFor = (token) => Uint8Array.from([...FAKE_JPEG, ...[...token].map((c) => c.charCodeAt(0) & 255)]);
const options = (extra = {}) => ({ fetchImage: async (token) => ({ data: jpegFor(token), type: 'jpg' }), ...extra });

describe('colour and size conversion', () => {
  it('turns CSS colours into Word colours', () => {
    expect(toDocxColor('#dc2626')).toBe('DC2626');
    expect(toDocxColor('#abc')).toBe('AABBCC');
    expect(toDocxColor('#aabbccdd')).toBe('AABBCC');
    expect(toDocxColor('rgb(1, 2, 255)')).toBe('0102FF');
    expect(toDocxColor('rgba(255,0,0,0.5)')).toBe('FF0000');
    for (const bad of ['red', '', null, 'url(x)', '#12']) expect(toDocxColor(bad)).toBeNull();
  });
  it('turns CSS sizes into half points', () => {
    expect(toHalfPoints('16px')).toBe(24); // 12 pt
    expect(toHalfPoints('18px')).toBe(27);
    expect(toHalfPoints('14pt')).toBe(28);
    expect(toHalfPoints('2em')).toBeNull();
    expect(toHalfPoints('')).toBeNull();
  });
});

describe('generateItineraryDocx', () => {
  it('produces a real .docx with the text, headings, details and company footer', async () => {
    const { blob, filename, skippedPhotos } = await generateItineraryDocx(itinerary(), options());
    expect(filename).toBe('bali-escape-itinerary.docx');
    expect(skippedPhotos).toBe(0);
    expect(blob.size).toBeGreaterThan(2000);
    const { xml, names } = await unzip(blob);
    for (const name of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml']) expect(names).toContain(name);
    for (const text of ['Bali Escape', 'Bali, Indonesia', '2 Nights / 3 Days', 'Overview', 'Day by day', 'Arrival', 'Overnight: Ubud', 'Meals: Dinner', 'Temples', 'Inclusions', 'Exclusions', 'Airfare', '7HEAVEN TOURISM']) {
      expect(xml, text).toContain(text);
    }
    expect(xml).toContain('Old plain text');
    expect(xml).toContain('second line');
  });

  it('keeps the formatting as real Word formatting', async () => {
    const { xml } = await unzip((await generateItineraryDocx(itinerary(), options())).blob);
    expect(xml).toMatch(/<w:b\s*\/>[\s\S]*relaxing/); // bold
    expect(xml).toContain('<w:i/>'); // italic
    expect(xml).toMatch(/<w:u w:val="single"\s*\/>/); // underline
    expect(xml).toContain('w:val="DC2626"'); // text colour
    expect(xml).toContain('w:val="27"'); // 18px = 13.5pt = 27 half-points
    expect(xml).toContain('w:fill="FDE047"'); // highlight as shading
    expect(xml).toMatch(/<w:numPr>/); // lists
    expect(xml).toContain('First');
    expect(xml).toContain('Second');
  });

  it('embeds each photo once and shows captions', async () => {
    const fetched = [];
    const { blob } = await generateItineraryDocx(itinerary(), { fetchImage: async (token) => (fetched.push(token), { data: jpegFor(token), type: 'jpg' }) });
    expect(fetched.sort()).toEqual([photo(1).token, photo(2).token, photo(3).token].sort());
    const { names, xml } = await unzip(blob);
    expect(names.filter((n) => n.startsWith('word/media/'))).toHaveLength(3);
    expect(xml).toContain('Beach at sunset');
  });

  it('reuses a photo that appears twice and reports progress from start to finish', async () => {
    let calls = 0;
    const steps = [];
    const twice = itinerary({ photos: [photo(7)], days: [{ title: 'a', description: '', photos: [photo(7)] }] });
    await generateItineraryDocx(twice, { fetchImage: async () => (calls += 1, { data: FAKE_JPEG, type: 'jpg' }), onProgress: (p) => steps.push(p) });
    expect(calls).toBe(1);
    expect(steps[0]).toBeLessThan(20);
    expect(steps[steps.length - 1]).toBe(100);
    expect([...steps]).toEqual([...steps].sort((a, b) => a - b));
  });

  it('skips a photo that cannot be loaded and says how many, instead of failing', async () => {
    const { blob, skippedPhotos } = await generateItineraryDocx(itinerary(), { fetchImage: async (token) => { if (token.startsWith('2')) throw new Error('404'); return { data: jpegFor(token), type: 'jpg' }; } });
    expect(skippedPhotos).toBe(1);
    expect((await unzip(blob)).names.filter((n) => n.startsWith('word/media/'))).toHaveLength(2);
  });

  it('handles an empty itinerary and text that tries to be markup', async () => {
    const empty = await generateItineraryDocx({ title: 'Just a title', nights: 0 }, options());
    expect((await unzip(empty.blob)).xml).toContain('Day trip');
    const nasty = await generateItineraryDocx(itinerary({ title: 'A <script>x</script> & "B"', summary: '<p onclick="x()">hi</p><script>alert(1)</script>' }), options());
    const { xml } = await unzip(nasty.blob);
    expect(xml).not.toMatch(/<script|onclick/i);
    expect(xml).toContain('A &lt;script&gt;x&lt;/script&gt; &amp; &quot;B&quot;'); // shown as harmless text
  });

  it('property: weird texts never make the export fail', async () => {
    const { default: fc } = await import('fast-check');
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 60 }), fc.string({ maxLength: 120 }), async (title, description) => {
        const { blob } = await generateItineraryDocx({ title, destination: title, nights: 1, days: [{ title: title || 'd', description }], inclusions: [description] }, options());
        expect(blob.size).toBeGreaterThan(1000);
      }),
      { numRuns: 25 }
    );
  });
});
