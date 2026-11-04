import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildFoundDocx, buildFoundPdf, exportFoundCsv, loadPictures, pictureSources, pictureType } from './hotelFinderExport';

const found = {
  name: 'Palm Grove Resort & Spa', propertyType: 'Resort', starRating: '4 star', description: 'A beachside resort.\n\nTwo pools & a spa.',
  address: { full: '12 Candolim Beach Road, Candolim, Goa 403515, India', locality: 'Candolim', country: 'India' }, geo: { lat: 15.5, lng: 73.76 },
  phones: ['+91 832 227 5599'], emails: ['stay@palmgrove.com'], website: 'https://palmgrove.com', checkIn: '14:00', checkOut: '11:00', amenities: ['Pool', 'Spa'],
  rooms: [{ name: 'Sea View Room', details: 'A bright room.' }], rates: { currency: 'INR', from: 6500, to: 9000, unit: 'night', text: 'From Rs 6,500 per night', note: 'As printed.' },
  policies: { cancellation: 'Free until 7 days before.' }, photos: [{ token: 'a'.repeat(24), width: 1600, height: 900, caption: 'Front' }, { token: 'b'.repeat(24), width: 800, height: 600 }],
  sourceUrl: 'https://palmgrove.com/', completeness: { score: 71, found: [], missing: [] }, warnings: ['Check the rates.']
};

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

const read = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(new Uint8Array(r.result)); r.onerror = reject; r.readAsArrayBuffer(blob); });

describe('pictures for the downloads', () => {
  it('knows a picture by its own bytes', () => {
    expect(pictureType(JPEG)).toBe('jpg');
    expect(pictureType(PNG)).toBe('png');
    expect(pictureType(WEBP)).toBe('webp');
    expect(pictureType(Uint8Array.from(Array(20).fill(7)))).toBe('');
    expect(pictureType(new Uint8Array(3))).toBe('');
    expect(pictureType(null)).toBe('');
  });
  it('lists at most four saved pictures to fetch, and fetches the ones that work', async () => {
    expect(pictureSources({ photos: Array.from({ length: 9 }, (_, i) => ({ token: String(i).padEnd(24, 'x'), width: 1, height: 1 })) }).length).toBe(4);
    expect(pictureSources({}).length).toBe(0);
    const fetchImpl = vi.fn(async (url) => (url.includes('good') ? { ok: true, arrayBuffer: async () => JPEG.buffer } : url.includes('html') ? { ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>').buffer } : { ok: false }));
    const pics = await loadPictures([{ url: '/media/good1', width: 10, height: 5 }, { url: '/media/missing' }, { url: '/media/html' }, { url: '/media/good2' }], fetchImpl);
    expect(pics.map((p) => p.type)).toEqual(['jpg', 'jpg']);
    expect(pics[0]).toMatchObject({ width: 10, height: 5 });
    expect(await loadPictures([{ url: 'x' }], null)).toEqual([]);
  });
});

describe('Word', () => {
  it('is a real .docx with the hotel, its sections and its facts', async () => {
    const { blob, filename, pictures } = await buildFoundDocx(found, []);
    expect(filename).toBe('Palm-Grove-Resort-Spa-details.docx');
    expect(pictures).toBe(0);
    const files = unzipSync(await read(blob));
    const xml = strFromU8(files['word/document.xml']);
    for (const text of ['Palm Grove Resort &amp; Spa', 'Contact', '+91 832 227 5599', 'stay@palmgrove.com', 'Location', 'Candolim', '2:00 PM', 'Sea View Room: A bright room.', 'Rates', 'Rs 6,500 to Rs 9,000 a night', 'Pool', 'Check the rates.', 'Two pools &amp; a spa.']) expect(xml, text).toContain(text);
    expect(xml).not.toContain('Hotel finder'.toUpperCase());
  });
  it('places JPEG and PNG pictures and skips WebP (Word cannot show it)', async () => {
    const { blob, pictures } = await buildFoundDocx(found, [{ data: JPEG, type: 'jpg', width: 1600, height: 900, caption: 'Front' }, { data: PNG, type: 'png', width: 800, height: 600 }, { data: WEBP, type: 'webp', width: 800, height: 600 }]);
    expect(pictures).toBe(2);
    const files = unzipSync(await read(blob));
    expect(Object.keys(files).filter((n) => n.startsWith('word/media/')).length).toBe(2);
  });
  it('a hotel with only a name still gives a document', async () => {
    const { blob } = await buildFoundDocx({ name: 'Only A Name' }, []);
    expect(strFromU8(unzipSync(await read(blob))['word/document.xml'])).toContain('Only A Name');
  });
});

describe('PDF', () => {
  it('is a real PDF of A4 pages with the hotel and its facts', async () => {
    const { doc, filename } = await buildFoundPdf(found, []);
    expect(filename).toBe('Palm-Grove-Resort-Spa-details.pdf');
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');
    const text = Buffer.from(bytes).toString('latin1');
    for (const part of ['Palm Grove Resort', 'Contact', 'stay@palmgrove.com', 'Sea View Room', 'Page 1 of']) expect(text, part).toContain(part);
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
  it('a very long hotel flows onto more pages without losing the end', async () => {
    const long = { ...found, description: Array.from({ length: 80 }, (_, i) => `Paragraph ${i} about the hotel and its many rooms.`).join('\n\n'), amenities: Array.from({ length: 60 }, (_, i) => `Amenity ${i}`), warnings: ['The very last warning.'] };
    const { doc } = await buildFoundPdf(long, []);
    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(2);
    expect(Buffer.from(new Uint8Array(doc.output('arraybuffer'))).toString('latin1')).toContain('The very last warning.');
  });
});

describe('CSV', () => {
  it('has nothing to write for an empty find, and says so', async () => {
    expect(await exportFoundCsv({})).toEqual({ ok: false, message: 'There is nothing to put in the file yet.' });
  });
});
