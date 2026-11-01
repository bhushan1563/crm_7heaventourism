import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), perms: { create: true, delete: true, edit: true } }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    can: (module, action) => (action === 'canCreate' ? h.perms.create : action === 'canDelete' ? h.perms.delete : true),
    canEditRecord: () => h.perms.edit
  })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => h.navigate }));
vi.mock('../services/itineraryService', () => ({
  default: { list: vi.fn(), destinations: vi.fn(), update: vi.fn(), duplicate: vi.fn(), remove: vi.fn() }
}));
vi.mock('../services/mediaService', () => ({ mediaUrl: (t, v = 'full') => `/media/${t}${v === 'thumb' ? '/thumb' : ''}` }));

import itineraryService from '../services/itineraryService';
import ItineraryListPage from './ItineraryListPage';

const item = (n, over = {}) => ({ _id: `id${n}`, title: `Trip ${n}`, destination: 'Bali', country: 'Indonesia', nights: 5, tags: ['beach'], status: 'Active', dayCount: 6, photoCount: 3, cover: { token: `tok${n}`, width: 1, height: 1 }, updatedAt: '2026-10-30T10:00:00.000Z', updatedByName: 'Asha Rao', ...over });
const page = (data, over = {}) => ({ success: true, data, total: data.length, page: 1, limit: 12, pages: 1, ...over });
const show = () => render(<MemoryRouter><ItineraryListPage /></MemoryRouter>);

beforeEach(() => {
  Object.values(itineraryService).forEach((fn) => fn.mockReset());
  itineraryService.destinations.mockResolvedValue({ success: true, data: [{ destination: 'Bali', count: 2 }, { destination: 'Dubai', count: 1 }] });
  h.showToast.mockReset();
  h.navigate.mockReset();
  Object.assign(h.perms, { create: true, delete: true, edit: true });
});
afterEach(cleanup);

describe('ItineraryListPage', () => {
  it('shows the itineraries as cards with their key facts', async () => {
    itineraryService.list.mockResolvedValue(page([item(1), item(2, { cover: null, photoCount: 0 })]));
    show();
    expect(await screen.findByText('Trip 1')).toBeInTheDocument();
    expect(screen.getByText('2 itineraries')).toBeInTheDocument();
    expect(screen.getAllByText('5 Nights / 6 Days')).toHaveLength(2);
    expect(screen.getByText('3 photos')).toBeInTheDocument();
    expect(screen.getByText('No photo yet')).toBeInTheDocument();
    expect(screen.getAllByText(/Updated 30-10-2026 by Asha Rao/)).toHaveLength(2);
  });

  it('invites the first itinerary when there are none, and hides the button without permission', async () => {
    itineraryService.list.mockResolvedValue(page([]));
    show();
    expect(await screen.findByText('No itineraries yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /create the first itinerary/i }));
    expect(h.navigate).toHaveBeenCalledWith('/itineraries/new');
    cleanup();

    h.perms.create = false;
    show();
    expect(await screen.findByText('No itineraries yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create the first itinerary/i })).toBeNull();
    expect(screen.getByRole('button', { name: /creation locked/i })).toBeDisabled();
  });

  it('says so, with a way out, when a search finds nothing', async () => {
    itineraryService.list.mockResolvedValueOnce(page([item(1)])).mockResolvedValue(page([]));
    show();
    await screen.findByText('Trip 1');
    await userEvent.type(screen.getByLabelText('Search itineraries'), 'zzz');
    expect(await screen.findByText('No itineraries match')).toBeInTheDocument();
    await waitFor(() => expect(itineraryService.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'zzz', page: 1 })));
    itineraryService.list.mockResolvedValue(page([item(1)]));
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(await screen.findByText('Trip 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Search itineraries')).toHaveValue('');
  });

  it('asks the server only after typing pauses, with the filters chosen', async () => {
    itineraryService.list.mockResolvedValue(page([item(1)]));
    show();
    await screen.findByText('Trip 1');
    const callsBefore = itineraryService.list.mock.calls.length;
    await userEvent.type(screen.getByLabelText('Search itineraries'), 'bali');
    expect(itineraryService.list.mock.calls.length).toBe(callsBefore); // still typing: no request yet
    await waitFor(() => expect(itineraryService.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'bali' })), { timeout: 2000 });
    expect(itineraryService.list.mock.calls.length).toBe(callsBefore + 1);

    await userEvent.selectOptions(screen.getByLabelText('Filter by destination'), 'Dubai');
    await waitFor(() => expect(itineraryService.list).toHaveBeenLastCalledWith(expect.objectContaining({ destination: 'Dubai', search: 'bali', page: 1 })));
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await waitFor(() => expect(itineraryService.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Archived' })));
  });

  it('pages through the results', async () => {
    itineraryService.list.mockImplementation(async ({ page: p }) => page([item(p)], { total: 30, pages: 3, page: p }));
    show();
    await screen.findByText('Trip 1');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Trip 2')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('shows a plain message with a retry when loading fails', async () => {
    itineraryService.list.mockRejectedValueOnce(Object.assign(new Error('x'), { request: {} })).mockResolvedValue(page([item(1)]));
    show();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server. Please check your connection.');
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Trip 1')).toBeInTheDocument();
  });

  it('shows a server message when the list is refused', async () => {
    itineraryService.list.mockResolvedValue({ success: false, message: 'Access Denied: You do not have permissions for the itineraries module.' });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Access Denied: You do not have permissions for the itineraries module.');
  });

  it('copies, archives and deletes (after confirmation), telling the user what happened', async () => {
    itineraryService.list.mockResolvedValue(page([item(1)]));
    itineraryService.duplicate.mockResolvedValue({ success: true });
    itineraryService.update.mockResolvedValue({ success: true });
    itineraryService.remove.mockResolvedValue({ success: true });
    show();
    await screen.findByText('Trip 1');

    await userEvent.click(screen.getByRole('button', { name: 'Copy Trip 1' }));
    expect(itineraryService.duplicate).toHaveBeenCalledWith('id1');
    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/A copy was created/), 'success');

    await userEvent.click(screen.getByRole('button', { name: 'Archive Trip 1' }));
    expect(itineraryService.update).toHaveBeenCalledWith('id1', { status: 'Archived' });
    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/archived/), 'success');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trip 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete this itinerary?');
    expect(itineraryService.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete itinerary' }));
    await waitFor(() => expect(itineraryService.remove).toHaveBeenCalledWith('id1'));
  });

  it('reports a failed action with the server message and leaves the list alone', async () => {
    itineraryService.list.mockResolvedValue(page([item(1)]));
    itineraryService.duplicate.mockResolvedValue({ success: false, message: 'Permission Denied: You do not have \'Create\' rights for itineraries.' });
    show();
    await screen.findByText('Trip 1');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Trip 1' }));
    expect(h.showToast).toHaveBeenCalledWith("Permission Denied: You do not have 'Create' rights for itineraries.", 'error');
  });

  it('hides edit, archive and delete from people who may only look', async () => {
    h.perms.edit = false;
    h.perms.delete = false;
    itineraryService.list.mockResolvedValue(page([item(1)]));
    show();
    await screen.findByText('Trip 1');
    expect(screen.getByRole('button', { name: /^view$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive trip 1/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete trip 1/i })).toBeNull();
  });
});
