import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/mediaService', () => ({
  uploadPhoto: vi.fn(),
  mediaUrl: (token, variant = 'full') => `/media/${token}${variant === 'thumb' ? '/thumb' : ''}`
}));
import { uploadPhoto } from '../services/mediaService';
import PhotoGallery from './PhotoGallery';
import { CLIPBOARD_BLOCKED, NOTHING_PASTED, SITE_BLOCKED } from '../utils/pastedImages';

// Pasting a copied picture (Ctrl+V, or the Paste tile) into a photo gallery: from Google or any page, a screenshot, a copied file.

const photo = (token) => ({ token, width: 1600, height: 1200, caption: '' });
const image = (name = 'image.png', type = 'image/png') => new File([new Uint8Array([1, 2, 3, 4])], name, { type });
const clip = ({ files = [], html = '', text = '' } = {}) => ({
  files,
  items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
  getData: (type) => (type === 'text/html' ? html : type === 'text/plain' ? text : '')
});
// fireEvent returns false when the page called preventDefault: that is how a handled paste shows.
const paste = (target, data) => !fireEvent.paste(target, { clipboardData: clip(data) });

const Harness = ({ max = 20, disabled = false, label = 'Photos', initial = [], onSeen }) => {
  const [photos, setPhotos] = useState(initial);
  return (
    <section aria-label={label}>
      <PhotoGallery
        photos={photos}
        max={max}
        disabled={disabled}
        purpose="itinerary"
        label={label}
        onChange={(next) => {
          setPhotos(next);
          onSeen?.(next);
        }}
      />
    </section>
  );
};
const gallery = (label = 'Photos') => screen.getByRole('region', { name: label }).querySelector('.photo-gallery');

beforeEach(() => {
  uploadPhoto.mockReset();
  uploadPhoto.mockImplementation(async (file) => photo(`tok-${file.name}`));
  vi.unstubAllGlobals();
});
afterEach(cleanup);

describe('pasting a copied picture (Ctrl+V)', () => {
  it('adds it when the pointer is over the gallery, naming a generic "image.png" so the tiles can be told apart', async () => {
    const seen = vi.fn();
    render(<Harness onSeen={seen} />);
    await userEvent.hover(gallery());
    expect(paste(document.body, { files: [image('image.png')] })).toBe(true); // handled: the browser's own paste is stopped
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1));
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(uploadPhoto.mock.calls[0][0].name).toBe('Pasted photo 1.png');
    expect(uploadPhoto.mock.calls[0][1]).toBe('itinerary');
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ token: 'tok-Pasted photo 1.png' })]);
    expect(screen.getByText('Cover')).toBeInTheDocument();
  });

  it('numbers several pasted pictures in the order they came, and keeps a real file name', async () => {
    render(<Harness />);
    await userEvent.hover(gallery());
    paste(document.body, { files: [image('image.png'), image('lake-view.png')] });
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    paste(document.body, { files: [image('image.png')] });
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    expect(uploadPhoto.mock.calls.map((c) => c[0].name)).toEqual(['Pasted photo 1.png', 'lake-view.png', 'Pasted photo 3.png']);
  });

  it('also works with the keyboard inside the gallery (no pointer needed)', async () => {
    render(<Harness />);
    await userEvent.tab(); // the first button of the gallery
    expect(gallery().contains(document.activeElement)).toBe(true);
    expect(paste(document.body, { files: [image()] })).toBe(true);
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
  });

  it('does nothing when the pointer and the keyboard are elsewhere, and stops when the pointer leaves', async () => {
    render(<Harness />);
    expect(paste(document.body, { files: [image()] })).toBe(false); // not handled
    await userEvent.hover(gallery());
    await userEvent.unhover(gallery());
    expect(paste(document.body, { files: [image()] })).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('leaves ordinary text alone: pasting words, or text into a box, is not taken', async () => {
    render(<Harness initial={[photo('a')]} />);
    await userEvent.hover(gallery());
    expect(paste(document.body, { text: 'just some words' })).toBe(false);
    const caption = screen.getByLabelText('Caption for photo 1');
    expect(paste(caption, { text: 'a caption' })).toBe(false);
    expect(paste(caption, { html: '<p>words</p>', text: 'words' })).toBe(false);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('is only for the gallery the pointer is on, when a page has several', async () => {
    render(
      <>
        <Harness label="Day 1 photos" />
        <Harness label="Day 2 photos" />
      </>
    );
    await userEvent.hover(gallery('Day 2 photos'));
    paste(document.body, { files: [image()] });
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Day 2 photos' }).querySelectorAll('.photo-tile img')).toHaveLength(1));
    expect(screen.getByRole('region', { name: 'Day 1 photos' }).querySelectorAll('.photo-tile img')).toHaveLength(0);
    await userEvent.hover(gallery('Day 1 photos'));
    paste(document.body, { files: [image('x.png')] });
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('region', { name: 'Day 1 photos' }).querySelectorAll('.photo-tile img')).toHaveLength(1);
  });

  it('is ignored by a gallery that cannot be changed, which also offers no way to add', async () => {
    render(<Harness disabled initial={[photo('a')]} />);
    await userEvent.hover(gallery());
    expect(paste(document.body, { files: [image()] })).toBe(false);
    expect(screen.queryByRole('button', { name: /Paste a picture/ })).toBeNull();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('says plainly when the gallery is full', async () => {
    render(<Harness max={1} initial={[photo('a')]} />);
    expect(screen.queryByRole('button', { name: /Paste a picture/ })).toBeNull(); // full: no add tiles
    await userEvent.hover(gallery());
    expect(paste(document.body, { files: [image()] })).toBe(true); // the paste is taken, so the person is told why nothing was added
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 1 photo fits here. Remove one to add another.');
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('adds only what fits and says so about the rest', async () => {
    render(<Harness max={2} />);
    await userEvent.hover(gallery());
    paste(document.body, { files: [image('a.png'), image('b.png'), image('c.png')] });
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    expect(screen.getByRole('alert')).toHaveTextContent('Only 2 photos fit here. "c.png" was not added.');
  });

  it('stops listening when the gallery is gone', async () => {
    const { unmount } = render(<Harness />);
    await userEvent.hover(gallery());
    unmount();
    expect(paste(document.body, { files: [image()] })).toBe(false);
  });
});

describe('a picture copied with its page, or at a web address', () => {
  it('reads a picture carried inside the copied page', async () => {
    render(<Harness />);
    await userEvent.hover(gallery());
    paste(document.body, { html: '<meta charset="utf-8"><img src="data:image/jpeg;base64,AQIDBA==">' });
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    const file = uploadPhoto.mock.calls[0][0];
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBe(4);
    expect(file.name).toBe('Pasted photo 1.jpg'); // it has no real name, so it is numbered like any pasted picture
  });

  it('fetches a picture at a web address when its site allows it, and names it like any pasted picture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }) })));
    render(<Harness />);
    await userEvent.hover(gallery());
    expect(paste(document.body, { html: '<img src="https://images.example.com/lake.png">' })).toBe(true);
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('https://images.example.com/lake.png', expect.objectContaining({ credentials: 'omit' }));
    expect(uploadPhoto.mock.calls[0][0].name).toBe('Pasted photo 1.png');
  });

  it('shows that it is getting the picture while it waits', async () => {
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) }); })));
    render(<Harness />);
    await userEvent.hover(gallery());
    paste(document.body, { text: 'https://images.example.com/slow.png' });
    expect(await screen.findByText('Getting the picture…')).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByText('Getting the picture…')).toBeNull());
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalled());
  });

  it('says plainly, and what to do, when the other site does not let us copy the picture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    render(<Harness />);
    await userEvent.hover(gallery());
    paste(document.body, { html: '<img src="https://protected.example.com/a.jpg">' });
    expect(await screen.findByRole('alert')).toHaveTextContent(SITE_BLOCKED);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('says so when a link is not a picture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['<html>'], { type: 'text/html' }) })));
    render(<Harness />);
    await userEvent.hover(gallery());
    paste(document.body, { text: 'https://example.com/not-really.jpg' });
    expect(await screen.findByRole('alert')).toHaveTextContent('That link is not a picture.');
  });

  it('takes a picture dragged from a web page onto the box', async () => {
    const { container } = render(<Harness />);
    const grid = container.querySelector('.photo-grid');
    fireEvent.drop(grid, { dataTransfer: { files: [], getData: (type) => (type === 'text/html' ? '<img src="data:image/png;base64,AQID">' : '') } });
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    expect(uploadPhoto.mock.calls[0][0].type).toBe('image/png');
  });

  it('still takes files dropped from the computer, as before', async () => {
    const { container } = render(<Harness />);
    fireEvent.drop(container.querySelector('.photo-grid'), { dataTransfer: { files: [image('from-disk.png')], getData: () => '' } });
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    expect(uploadPhoto.mock.calls[0][0].name).toBe('from-disk.png');
  });
});

describe('the Paste tile', () => {
  const clipboardWith = (items) => vi.stubGlobal('navigator', { ...navigator, clipboard: { read: vi.fn(async () => items) } });
  const item = (types) => ({ types: Object.keys(types), getType: async (type) => types[type] });

  it('is there for people who do not know the shortcut, and says what to copy', () => {
    render(<Harness />);
    const tile = screen.getByRole('button', { name: /Paste a picture/ });
    expect(tile).toHaveTextContent('Paste a picture');
    expect(tile).toHaveTextContent('copied from Google or any page');
    expect(screen.getByText(/point at this box and press Ctrl\+V/)).toBeInTheDocument();
  });

  it('has a tip for a computer (Ctrl+V) and one for a phone (tap the tile): the style sheet shows the one that fits the screen', () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('.photo-hint-keys')).toHaveTextContent(/right-click it.*press Ctrl\+V/);
    expect(container.querySelector('.photo-hint-touch')).toHaveTextContent(/touch and hold it.*tap "Paste a picture"/);
  });

  it('adds the picture the browser finds on the clipboard', async () => {
    clipboardWith([item({ 'image/png': new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) })]);
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Paste a picture/ }));
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    expect(uploadPhoto.mock.calls[0][0]).toMatchObject({ name: 'Pasted photo 1.png', type: 'image/png' });
  });

  it('reads a picture carried in a copied page too', async () => {
    clipboardWith([item({ 'text/html': new Blob(['<img src="data:image/webp;base64,AQID">'], { type: 'text/html' }) })]);
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Paste a picture/ }));
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    expect(uploadPhoto.mock.calls[0][0].type).toBe('image/webp');
  });

  it('says there is no picture when what was copied is only words', async () => {
    clipboardWith([item({ 'text/plain': new Blob(['hello there'], { type: 'text/plain' }) })]);
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Paste a picture/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NOTHING_PASTED);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('tells the person to press Ctrl+V when the browser will not let us read the clipboard (or has no way to)', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { read: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }) } });
    const first = render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Paste a picture/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CLIPBOARD_BLOCKED);
    first.unmount();
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Paste a picture/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CLIPBOARD_BLOCKED);
  });

  it('and Ctrl+V works right after, because the tile keeps the keyboard in the gallery', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Paste a picture/ }));
    await userEvent.unhover(gallery());
    expect(paste(document.body, { files: [image()] })).toBe(true);
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
  });
});
