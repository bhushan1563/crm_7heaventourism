import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/mediaService', () => ({
  uploadPhoto: vi.fn(),
  mediaUrl: (token, variant = 'full') => `/media/${token}${variant === 'thumb' ? '/thumb' : ''}`
}));
import { uploadPhoto } from '../services/mediaService';
import PhotoGallery from './PhotoGallery';

const photo = (token, caption = '') => ({ token, width: 1600, height: 1200, caption });
const jpeg = (name = 'a.jpg') => new File([new Uint8Array(2000)], name, { type: 'image/jpeg' });

// Holds the list the way a real form would, so the gallery is tested through its own onChange.
const Harness = ({ initial = [], max, onSeen }) => {
  const [photos, setPhotos] = useState(initial);
  return (
    <PhotoGallery
      photos={photos}
      max={max}
      purpose="hotel"
      onChange={(next) => {
        setPhotos(next);
        onSeen?.(next);
      }}
    />
  );
};

beforeEach(() => {
  uploadPhoto.mockReset(); // (braces: a function returned from beforeEach would be run as a cleanup)
});
afterEach(cleanup);

describe('PhotoGallery', () => {
  it('uploads chosen photos and shows them, the first as the cover', async () => {
    uploadPhoto.mockImplementation(async (file) => photo(`tok-${file.name}`));
    const seen = vi.fn();
    const { container } = render(<Harness onSeen={seen} />);
    await userEvent.upload(container.querySelector('input[type=file]'), [jpeg('one.jpg'), jpeg('two.jpg')]);

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(uploadPhoto.mock.calls[0][1]).toBe('hotel');
    expect(screen.getAllByText('Cover')).toHaveLength(1);
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ token: 'tok-one.jpg' }), expect.objectContaining({ token: 'tok-two.jpg' })].map((m) => m));
  });

  it('keeps the photos in the order they were chosen even when a big one finishes uploading last', async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    uploadPhoto.mockImplementation(async (file) => {
      await wait(file.name === 'big-first.jpg' ? 120 : file.name === 'second.jpg' ? 60 : 5);
      return photo(`tok-${file.name}`);
    });
    const seen = vi.fn();
    const { container } = render(<Harness onSeen={seen} />);
    await userEvent.upload(container.querySelector('input[type=file]'), [jpeg('big-first.jpg'), jpeg('second.jpg'), jpeg('third.jpg')]);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3), { timeout: 3000 });
    expect(seen).toHaveBeenLastCalledWith(['tok-big-first.jpg', 'tok-second.jpg', 'tok-third.jpg'].map((token) => expect.objectContaining({ token })));
  });

  it('puts a later batch after the photos already in the list', async () => {
    uploadPhoto.mockImplementation(async (file) => photo(`tok-${file.name}`));
    const seen = vi.fn();
    const { container } = render(<Harness initial={[photo('old-1'), photo('old-2')]} onSeen={seen} />);
    await userEvent.upload(container.querySelector('input[type=file]'), [jpeg('new-1.jpg'), jpeg('new-2.jpg')]);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(4));
    expect(seen).toHaveBeenLastCalledWith(['old-1', 'old-2', 'tok-new-1.jpg', 'tok-new-2.jpg'].map((token) => expect.objectContaining({ token })));
  });

  it('does not list the same photo twice when the server recognises it', async () => {
    uploadPhoto.mockResolvedValue(photo('same-token'));
    const { container } = render(<Harness />);
    await userEvent.upload(container.querySelector('input[type=file]'), jpeg('first.jpg'));
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1));
    await userEvent.upload(container.querySelector('input[type=file]'), jpeg('again.jpg'));
    expect(await screen.findByRole('alert')).toHaveTextContent('"again.jpg" is already in this list, so it was not added again.');
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('turns away files that are not usable photos, with the reason', async () => {
    const { container } = render(<Harness />);
    const input = container.querySelector('input[type=file]');
    await userEvent.upload(input, new File(['x'], 'doc.pdf', { type: 'application/pdf' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('"doc.pdf" is not a JPG, PNG or WebP photo.');
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('stops at the maximum and says so', async () => {
    uploadPhoto.mockImplementation(async (file) => photo(`t-${file.name}`));
    const { container } = render(<Harness max={2} />);
    await userEvent.upload(container.querySelector('input[type=file]'), [jpeg('1.jpg'), jpeg('2.jpg'), jpeg('3.jpg')]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 2 photos fit here. "3.jpg" was not added.');
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
  });

  it('shows the server message when an upload fails and lets the user try again', async () => {
    uploadPhoto.mockRejectedValueOnce(new Error('Photo storage is full (350 MB of 350 MB used).')).mockResolvedValueOnce(photo('ok-token'));
    const { container } = render(<Harness />);
    await userEvent.upload(container.querySelector('input[type=file]'), jpeg('big.jpg'));

    expect(await screen.findByText('Photo storage is full (350 MB of 350 MB used).')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1));
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
  });

  it('removes, reorders and captions photos', async () => {
    const seen = vi.fn();
    render(<Harness initial={[photo('a'), photo('b'), photo('c')]} onSeen={seen} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Move photo later' })[0]);
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ token: 'b' }), expect.objectContaining({ token: 'a' }), expect.objectContaining({ token: 'c' })]);

    await userEvent.type(screen.getByLabelText('Caption for photo 1'), 'Pool');
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ token: 'b', caption: 'Pool' }), expect.anything(), expect.anything()]);

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove photo' })[1]);
    expect(seen).toHaveBeenLastCalledWith([expect.objectContaining({ token: 'b' }), expect.objectContaining({ token: 'c' })]);
  });

  it('opens a photo larger and walks through the others', async () => {
    render(<Harness initial={[photo('a', 'Lobby'), photo('b', 'Pool')]} />);
    await userEvent.click(screen.getByRole('button', { name: 'View photo 1 larger' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByAltText('Lobby').getAttribute('src')).toBe('/media/a');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next photo' }));
    expect(within(dialog).getByAltText('Pool').getAttribute('src')).toBe('/media/b');
  });
});
