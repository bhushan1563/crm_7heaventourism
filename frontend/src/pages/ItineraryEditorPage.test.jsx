import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), perms: { create: true, delete: true, edit: true } }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    can: (m, a) => (a === 'canCreate' ? h.perms.create : a === 'canDelete' ? h.perms.delete : true),
    canEditRecord: () => h.perms.edit
  })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../services/itineraryService', () => ({ default: { get: vi.fn(), create: vi.fn(), update: vi.fn(), duplicate: vi.fn(), remove: vi.fn() } }));
// The real editor and gallery have their own tests; here they are simple stand-ins so this file tests the page's logic.
vi.mock('../components/LazyRichTextEditor', () => ({
  default: ({ value, onChange, ariaLabel }) => <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
}));
vi.mock('../components/PhotoGallery', () => ({
  default: ({ photos, onChange, label }) => (
    <div>
      <span>{label}: {photos.length}</span>
      <button type="button" onClick={() => onChange([...photos, { token: 'N'.repeat(24), width: 1, height: 1, caption: '' }])}>add photo to {label}</button>
    </div>
  )
}));

import itineraryService from '../services/itineraryService';
import ItineraryEditorPage from './ItineraryEditorPage';

const stored = (over = {}) => ({
  _id: 'abc123',
  title: 'Bali Escape',
  destination: 'Bali',
  country: 'Indonesia',
  nights: 2,
  summary: '<p>Nice</p>',
  photos: [],
  days: [
    { title: 'Arrival', description: '<p>Welcome</p>', meals: 'Dinner', stay: 'Ubud', photos: [] },
    { title: 'Temples', description: '', meals: '', stay: '', photos: [] }
  ],
  inclusions: ['Breakfast'],
  exclusions: [],
  tags: ['beach'],
  status: 'Active',
  createdBy: 'u1',
  updatedAt: '2026-10-30T10:00:00.000Z',
  ...over
});

const titleField = () => screen.getByLabelText('Title *', { selector: '#field-title' });

const open = (path = '/itineraries/new') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/itineraries" element={<p>LIBRARY</p>} />
        <Route path="/itineraries/new" element={<ItineraryEditorPage />} />
        <Route path="/itineraries/:id/edit" element={<ItineraryEditorPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  Object.values(itineraryService).forEach((fn) => fn.mockReset());
  h.showToast.mockReset();
  Object.assign(h.perms, { create: true, delete: true, edit: true });
});
afterEach(cleanup);

describe('creating an itinerary', () => {
  it('shows what is missing, next to each field, and does not call the server', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: /create itinerary/i }));
    expect(await screen.findByText('Please enter a title for the itinerary.')).toBeInTheDocument();
    expect(screen.getByText('Please enter the destination.')).toBeInTheDocument();
    expect(screen.getByText('Please enter a title for Day 1.')).toBeInTheDocument();
    expect(h.showToast).toHaveBeenCalledWith('Please fix the 3 highlighted fields before saving.', 'warning');
    expect(itineraryService.create).not.toHaveBeenCalled();
    expect(titleField()).toHaveFocus();
    expect(titleField()).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(titleField(), 'Bali');
    expect(screen.queryByText('Please enter a title for the itinerary.')).toBeNull();
  });

  it('saves exactly what was typed, tidied for the server', async () => {
    itineraryService.create.mockResolvedValue({ success: true, data: stored() });
    open();
    await userEvent.type(titleField(), 'Bali Escape');
    await userEvent.type(screen.getByLabelText(/^Destination/), 'Bali');
    await userEvent.clear(screen.getByLabelText('Nights'));
    await userEvent.type(screen.getByLabelText('Nights'), '2');
    expect(screen.getByText('2 Nights / 3 Days')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Add a tag'), 'Beach{enter}');
    await userEvent.type(screen.getByLabelText('Title *', { selector: '#day-title-0' }), 'Arrival');
    await userEvent.type(screen.getByLabelText('Description of Day 1'), 'Welcome');
    await userEvent.click(screen.getByRole('button', { name: 'add photo to Photos for Day 1' }));
    await userEvent.click(screen.getAllByRole('button', { name: /^add a line$/i })[0]); // the first list is the inclusions
    await userEvent.type(screen.getByLabelText('Inclusion, line 1'), 'Breakfast');

    await userEvent.click(screen.getByRole('button', { name: /create itinerary/i }));
    await waitFor(() => expect(itineraryService.create).toHaveBeenCalledTimes(1));
    const payload = itineraryService.create.mock.calls[0][0];
    expect(payload).toMatchObject({ title: 'Bali Escape', destination: 'Bali', nights: 2, tags: ['beach'], inclusions: ['Breakfast'], status: 'Active' });
    expect(payload.days).toEqual([{ title: 'Arrival', description: 'Welcome', meals: '', stay: '', photos: [{ token: 'N'.repeat(24), caption: '' }] }]);
    expect(h.showToast).toHaveBeenCalledWith('Itinerary created.', 'success');
  });

  it('shows the server message and keeps the work when saving fails', async () => {
    itineraryService.create.mockResolvedValue({ success: false, message: 'One of the photos is no longer available. Please remove it and add it again.' });
    open();
    await userEvent.type(titleField(), 'T');
    await userEvent.type(screen.getByLabelText(/^Destination/), 'D');
    await userEvent.type(screen.getByLabelText('Title *', { selector: '#day-title-0' }), 'Day');
    await userEvent.click(screen.getByRole('button', { name: /create itinerary/i }));
    expect(await screen.findByRole('alert', { name: '' })).toBeTruthy();
    expect(screen.getByText('One of the photos is no longer available. Please remove it and add it again.')).toBeInTheDocument();
    expect(titleField()).toHaveValue('T');
    expect(screen.getByRole('button', { name: /create itinerary/i })).toBeEnabled();
  });

  it('survives a network failure with a plain message', async () => {
    itineraryService.create.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    open();
    await userEvent.type(titleField(), 'T');
    await userEvent.type(screen.getByLabelText(/^Destination/), 'D');
    await userEvent.type(screen.getByLabelText('Title *', { selector: '#day-title-0' }), 'Day');
    await userEvent.click(screen.getByRole('button', { name: /create itinerary/i }));
    expect(await screen.findByText('Cannot reach the server. Please check your connection.')).toBeInTheDocument();
  });

  it('can fill in days to match the nights and manage them', async () => {
    open();
    await userEvent.clear(screen.getByLabelText('Nights'));
    await userEvent.type(screen.getByLabelText('Nights'), '3');
    await userEvent.click(screen.getByRole('button', { name: /fill days to match nights/i }));
    expect(screen.getAllByText(/^Day \d$/)).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Day 4' })); // empty: removed without asking
    expect(screen.getAllByText(/^Day \d$/)).toHaveLength(3);
    await userEvent.type(screen.getByLabelText('Title *', { selector: '#day-title-0' }), 'First');
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate Day 1' }));
    expect(screen.getByText('First (copy)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Day 1' })); // has content: asks first
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remove Day 1?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove day' }));
    expect(screen.queryByText('First')).toBeNull();
  });
});

describe('editing an itinerary', () => {
  it('loads the record, saves with the version it was loaded at, and shows it as saved', async () => {
    itineraryService.get.mockResolvedValue({ success: true, data: stored() });
    itineraryService.update.mockResolvedValue({ success: true, data: stored({ title: 'Bali Deluxe', updatedAt: '2026-10-30T11:00:00.000Z' }) });
    open('/itineraries/abc123/edit');
    expect(await screen.findByDisplayValue('Bali Escape')).toBeInTheDocument();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();

    await userEvent.clear(titleField());
    await userEvent.type(titleField(), 'Bali Deluxe');
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(itineraryService.update).toHaveBeenCalled());
    const [id, payload] = itineraryService.update.mock.calls[0];
    expect(id).toBe('abc123');
    expect(payload).toMatchObject({ title: 'Bali Deluxe', updatedAt: '2026-10-30T10:00:00.000Z' });
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('tells the user when someone else saved first, and offers the latest version', async () => {
    itineraryService.get.mockResolvedValue({ success: true, data: stored() });
    itineraryService.update.mockResolvedValue({ success: false, message: 'This itinerary was changed by Asha Rao while you were editing it. Please reload to see their changes before saving.' });
    open('/itineraries/abc123/edit');
    await screen.findByDisplayValue('Bali Escape');
    await userEvent.type(titleField(), '!');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/changed by Asha Rao while you were editing it/)).toBeInTheDocument();

    itineraryService.get.mockResolvedValue({ success: true, data: stored({ title: 'Asha version', updatedAt: '2026-10-30T12:00:00.000Z' }) });
    await userEvent.click(screen.getByRole('button', { name: /load the latest version/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/replaces what is on this page/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Load the latest version' }));
    expect(await screen.findByDisplayValue('Asha version')).toBeInTheDocument();
  });

  it('asks before throwing away unsaved changes', async () => {
    itineraryService.get.mockResolvedValue({ success: true, data: stored() });
    open('/itineraries/abc123/edit');
    await screen.findByDisplayValue('Bali Escape');
    await userEvent.type(titleField(), 'x');
    await userEvent.click(screen.getAllByRole('button', { name: /itinerary library/i })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Leave without saving?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('LIBRARY')).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: /itinerary library/i })[0]);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByText('LIBRARY')).toBeInTheDocument();
  });

  it('leaves immediately when nothing was changed', async () => {
    itineraryService.get.mockResolvedValue({ success: true, data: stored() });
    open('/itineraries/abc123/edit');
    await screen.findByDisplayValue('Bali Escape');
    await userEvent.click(screen.getAllByRole('button', { name: /itinerary library/i })[0]);
    expect(await screen.findByText('LIBRARY')).toBeInTheDocument();
  });

  it('explains when the itinerary no longer exists', async () => {
    itineraryService.get.mockResolvedValue({ success: false, message: 'Itinerary not found. It may have been removed.' });
    open('/itineraries/gone/edit');
    expect(await screen.findByText('This itinerary cannot be opened')).toBeInTheDocument();
    expect(screen.getByText('Itinerary not found. It may have been removed.')).toBeInTheDocument();
  });

  it('is read-only for someone who may not edit it', async () => {
    h.perms.edit = false;
    itineraryService.get.mockResolvedValue({ success: true, data: stored() });
    open('/itineraries/abc123/edit');
    await screen.findByDisplayValue('Bali Escape');
    expect(screen.getByText(/You can view this itinerary but not change it/)).toBeInTheDocument();
    expect(titleField()).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
  });

  it('archives and restores, and refuses to do so while there are unsaved changes', async () => {
    itineraryService.get.mockResolvedValue({ success: true, data: stored() });
    itineraryService.update.mockResolvedValue({ success: true, data: stored({ status: 'Archived' }) });
    open('/itineraries/abc123/edit');
    await screen.findByDisplayValue('Bali Escape');
    await userEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    await waitFor(() => expect(itineraryService.update).toHaveBeenCalledWith('abc123', { status: 'Archived' }));
    expect(await screen.findByRole('button', { name: /^restore$/i })).toBeInTheDocument();
    await userEvent.type(titleField(), 'x');
    expect(screen.getByRole('button', { name: /^restore$/i })).toBeDisabled();
  });
});
