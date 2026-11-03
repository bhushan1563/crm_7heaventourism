import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { MAX_PASTED_SOURCES, SITE_BLOCKED, blobText, fileFromDataUrl, fileFromUrl, imageSources, isGenericName, pastedName, readClipboard, toPhotoFile } from './pastedImages';

const png = (name = 'image.png') => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], name, { type: 'image/png' });
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const bytesOf = (file) => new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(Array.from(new Uint8Array(reader.result))); reader.readAsArrayBuffer(file); });

describe('readClipboard', () => {
  it('finds a picture file the browser put on the clipboard (a screenshot, "Copy image")', () => {
    const file = png();
    const { files } = readClipboard({ items: [{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'image/png', getAsFile: () => file }], files: [], getData: () => '' });
    expect(files).toEqual([file]);
  });

  it('falls back to the files list, and keeps only pictures', () => {
    const file = png('real.png');
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    expect(readClipboard({ items: [], files: [pdf, file], getData: () => '' }).files).toEqual([file]);
    expect(readClipboard({ items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => pdf }], files: [pdf], getData: () => '' }).files).toEqual([]);
  });

  it('does not count a picture twice when it is in both lists', () => {
    const file = png();
    expect(readClipboard({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], files: [file], getData: () => '' }).files).toHaveLength(1);
  });

  it('reads the copied page and the plain text, and copes with a clipboard that is missing or odd', () => {
    const data = { items: [], files: [], getData: (type) => (type === 'text/html' ? '<img src="https://x.com/a.jpg">' : 'https://x.com/a.jpg') };
    expect(readClipboard(data)).toMatchObject({ html: '<img src="https://x.com/a.jpg">', text: 'https://x.com/a.jpg' });
    expect(readClipboard(undefined)).toEqual({ files: [], html: '', text: '' });
    expect(readClipboard({ getData: () => { throw new Error('blocked'); } })).toEqual({ files: [], html: '', text: '' });
  });
});

describe('imageSources', () => {
  it('finds the pictures in a copied page: carried inside it, or at a web address', () => {
    const html = `<html><body><img src="data:image/png;base64,iVBORw0KGgo=" alt="a"><div><img src="https://images.example.com/a.jpg?w=800&amp;h=600"></div></body></html>`;
    expect(imageSources(html, '')).toEqual([
      { kind: 'data', value: 'data:image/png;base64,iVBORw0KGgo=' },
      { kind: 'url', value: 'https://images.example.com/a.jpg?w=800&h=600' }
    ]);
  });

  it('takes a copied web address (picture addresses often have no ".jpg" at the end), but not a sentence or another kind of link', () => {
    expect(imageSources('', 'https://cdn.example.com/photos/lake.JPG?x=1')).toEqual([{ kind: 'url', value: 'https://cdn.example.com/photos/lake.JPG?x=1' }]);
    expect(imageSources('', '  https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ  ')).toEqual([{ kind: 'url', value: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ' }]);
    expect(imageSources('', 'see https://example.com/a.jpg please')).toEqual([]);
    expect(imageSources('', 'hello')).toEqual([]);
    expect(imageSources('', 'ftp://example.com/a.jpg')).toEqual([]);
    expect(imageSources('', '')).toEqual([]);
  });

  it('never accepts a script or any other kind of address as a picture', () => {
    const html = '<img src="javascript:alert(1)"><img src="file:///C:/secret.png"><img src="data:text/html;base64,PHNjcmlwdD4="><img src="//cdn.example.com/a.jpg"><img>';
    expect(imageSources(html, '')).toEqual([]);
  });

  it('lists each picture once, and never more than the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => `<img src="https://x.com/${i}.jpg">`).join('') + '<img src="https://x.com/0.jpg">';
    expect(imageSources(many, '')).toHaveLength(MAX_PASTED_SOURCES);
    expect(imageSources('<img src="https://x.com/a.jpg"><img src="https://x.com/a.jpg">', 'https://x.com/a.jpg')).toHaveLength(1);
  });
});

describe('blobText', () => {
  it('reads the text of a blob, with or without the browser\'s own Blob.text', async () => {
    expect(await blobText(new Blob(['<img src="x">'], { type: 'text/html' }))).toBe('<img src="x">');
    expect(await blobText({ text: async () => 'from the browser' })).toBe('from the browser');
    expect(await blobText(new Blob([''], { type: 'text/plain' }))).toBe('');
  });
});

describe('fileFromDataUrl', () => {
  it('turns a picture carried inside copied content back into a file with the same bytes', async () => {
    const bytes = [1, 2, 3, 250, 251, 252, 0, 7];
    const file = fileFromDataUrl(`data:image/jpeg;base64,${toBase64(bytes)}`, 'Pasted photo 1.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('Pasted photo 1.jpg');
    expect(await bytesOf(file)).toEqual(bytes);
  });

  it('refuses what is not a picture, not base64, or empty', () => {
    expect(fileFromDataUrl('data:text/plain;base64,aGk=')).toBeNull();
    expect(fileFromDataUrl('data:image/png;base64,@@@@')).toBeNull();
    expect(fileFromDataUrl('data:image/png;base64,')).toBeNull();
    expect(fileFromDataUrl('https://x.com/a.png')).toBeNull();
    expect(fileFromDataUrl(undefined)).toBeNull();
  });
});

describe('fileFromUrl', () => {
  const answer = (blob, ok = true) => vi.fn(async () => ({ ok, blob: async () => blob }));

  it('fetches a picture that its site lets us read, without sending any login or referrer', async () => {
    const fetchImpl = answer(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const file = await fileFromUrl('https://x.com/a.jpg', 'Pasted photo 1.jpg', fetchImpl);
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith('https://x.com/a.jpg', { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('says plainly when the site does not let us copy the picture, and what to do', async () => {
    await expect(fileFromUrl('https://x.com/a.jpg', 'p', vi.fn(async () => { throw new TypeError('Failed to fetch'); }))).rejects.toThrow(SITE_BLOCKED);
    await expect(fileFromUrl('https://x.com/a.jpg', 'p', answer(new Blob(['x']), false))).rejects.toThrow(SITE_BLOCKED);
    await expect(fileFromUrl('https://x.com/a.jpg', 'p', null)).rejects.toThrow(SITE_BLOCKED);
    expect(SITE_BLOCKED).toMatch(/Copy image/);
    expect(SITE_BLOCKED).toMatch(/Add photos/);
  });

  it('says so when the link is not a picture', async () => {
    await expect(fileFromUrl('https://x.com/page', 'p', answer(new Blob(['<html>'], { type: 'text/html' })))).rejects.toThrow('That link is not a picture.');
  });
});

describe('names and kinds', () => {
  it('knows a generic name from a real one', () => {
    for (const name of ['', 'image.png', 'Image.PNG', 'unnamed.png', 'blob', 'Screenshot.png', 'image (2).png', 'Pasted photo 3.png']) expect(isGenericName(name), name).toBe(true);
    for (const name of ['lake-view.jpg', 'IMG_2041.JPG', 'Taj Mahal.png', 'image-of-lake.png']) expect(isGenericName(name), name).toBe(false);
  });

  it('names a pasted picture by its number and its kind', () => {
    expect(pastedName('image/png', 1)).toBe('Pasted photo 1.png');
    expect(pastedName('image/jpeg', 2)).toBe('Pasted photo 2.jpg');
    expect(pastedName('image/webp', 3)).toBe('Pasted photo 3.webp');
    expect(pastedName('image/unknown', 4)).toBe('Pasted photo 4.png');
  });

  it('gives a generic name a number so the tiles can be told apart, and keeps a real name', async () => {
    expect((await toPhotoFile(png('image.png'), 2)).name).toBe('Pasted photo 2.png');
    expect((await toPhotoFile(png('lake-view.png'), 2)).name).toBe('lake-view.png');
  });

  it('uses JPG, PNG and WebP as they are, and converts any other kind of picture', async () => {
    const convert = vi.fn(async (file) => new File([file], 'x.png', { type: 'image/png' }));
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      await toPhotoFile(new File(['x'], 'a.img', { type }), 1, convert);
    }
    expect(convert).not.toHaveBeenCalled();
    const converted = await toPhotoFile(new File(['x'], 'image.gif', { type: 'image/gif' }), 5, convert);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(converted.type).toBe('image/png');
    expect(converted.name).toBe('Pasted photo 5.png');
  });

  it('says plainly when a kind of picture cannot be converted', async () => {
    await expect(toPhotoFile(new File(['x'], 'a.tif', { type: 'image/tiff' }), 1, async () => { throw new Error('no'); })).rejects.toThrow(/"a\.tif" is in a kind of picture we cannot use/);
  });
});

describe('property', () => {
  it('a picture carried in copied content always comes back with exactly its bytes and its kind', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 200 }), fc.constantFrom('image/png', 'image/jpeg', 'image/webp'), async (bytes, type) => {
        const file = fileFromDataUrl(`data:${type};base64,${toBase64(Array.from(bytes))}`);
        expect(file.type).toBe(type);
        expect(await bytesOf(file)).toEqual(Array.from(bytes));
      }),
      { numRuns: 100 }
    );
  });

  it('whatever the copied page or text is, reading it never throws and only ever gives data pictures or web addresses, within the limit', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), fc.string({ maxLength: 80 }), (html, text) => {
        const sources = imageSources(html, text);
        expect(sources.length).toBeLessThanOrEqual(MAX_PASTED_SOURCES);
        for (const s of sources) {
          expect(['data', 'url']).toContain(s.kind);
          expect(s.kind === 'data' ? /^data:image\//i.test(s.value) : /^https?:\/\//i.test(s.value)).toBe(true);
        }
        expect(typeof readClipboard({ getData: () => html }).html).toBe('string');
        expect(fileFromDataUrl(html) === null || fileFromDataUrl(html) instanceof File).toBe(true);
      }),
      { numRuns: 300 }
    );
  });
});
