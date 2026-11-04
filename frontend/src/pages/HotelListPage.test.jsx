import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), perms: { create: true, delete: true, edit: true, quote: true } }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    can: (module, action) => (module === 'quotations' ? h.perms.quote : action === 'canCreate' ? h.perms.create : action === 'canDelete' ? h.perms.delete : true),
    canEditRecord: () => h.perms.edit
  })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => h.navigate }));
vi.mock('../services/hotelService', () => ({ default: { list: vi.fn(), cities: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock('../services/hotelFinderService', () => ({ default: { list: vi.fn() } }));
vi.mock('../services/mediaService', () => ({ mediaUrl: (t, v = 'full') => `/media/${t}${v === 'thumb' ? '/thumb' : ''}` }));

import hotelService from '../services/hotelService';
import hotelFinderService from '../services/hotelFinderService';
import HotelListPage from './HotelListPage';

const hotel = (n, over = {}) => ({ _id: `id${n}`, name: `Hotel ${n}`, city: 'Ubud', country: 'Indonesia', area: 'Centre', starRating: '5 star', tags: ['beach'], status: 'Active', roomTypeCount: 3, photoCount: 4, phone: '+62 361 123', cover: { token: `tok${n}`, width: 1, height: 1 }, updatedAt: '2026-10-30T10:00:00.000Z', updatedByName: 'Asha Rao', ...over });
const page = (data, over = {}) => ({ success: true, data, total: data.length, page: 1, limit: 12, pages: 1, ...over });
const show = () => render(<MemoryRouter><HotelListPage /></MemoryRouter>);

beforeEach(() => {
  Object.values(hotelService).forEach((fn) => fn.mockReset());
  hotelService.cities.mockResolvedValue({ success: true, data: [{ city: 'Goa', count: 2 }, { city: 'Ubud', count: 1 }] });
  hotelFinderService.list.mockReset();
  hotelFinderService.list.mockResolvedValue({ success: true, data: [], total: 3, page: 1, limit: 12, pages: 1 });
  h.showToast.mockReset();
  h.navigate.mockReset();
  Object.assign(h.perms, { create: true, delete: true, edit: true, quote: true });
});
afterEach(cleanup);

describe('HotelListPage', () => {
  it('shows the hotels as cards with their key facts', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1), hotel(2, { cover: null, photoCount: 0, roomTypeCount: 1, starRating: 'Heritage / Palace', area: '' })]));
    show();
    expect(await screen.findByText('Hotel 1')).toBeInTheDocument();
    expect(screen.getByText('2 hotels')).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('article');
    expect(within(first).getByText('5 Star Luxury')).toBeInTheDocument();
    expect(within(second).getByText('Heritage / Palace')).toBeInTheDocument();
    expect(within(first).getByText('Centre, Ubud, Indonesia')).toBeInTheDocument();
    expect(within(second).getByText('Ubud, Indonesia')).toBeInTheDocument();
    expect(screen.queryByText(/room type/)).toBeNull(); // rooms are no longer kept on a hotel, so no count (the server may still send one)
    expect(screen.getByText('4 photos')).toBeInTheDocument();
    expect(screen.getByText('No photo yet')).toBeInTheDocument();
    expect(screen.getAllByText(/Updated 30-10-2026 by Asha Rao/)).toHaveLength(2);
  });

  it('invites the first hotel when there are none, and says why adding is locked without permission', async () => {
    hotelService.list.mockResolvedValue(page([]));
    show();
    expect(await screen.findByText('No hotels yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add the first hotel/i }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels/new');
    cleanup();

    h.perms.create = false;
    show();
    expect(await screen.findByText('No hotels yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add the first hotel/i })).toBeNull();
    expect(screen.getByRole('button', { name: /adding locked/i })).toBeDisabled();
  });

  it('searches after typing pauses, says so with a way out when nothing matches', async () => {
    hotelService.list.mockResolvedValueOnce(page([hotel(1)])).mockResolvedValue(page([]));
    show();
    await screen.findByText('Hotel 1');
    await userEvent.type(screen.getByLabelText('Search hotels'), 'zzz');
    expect(await screen.findByText('No hotels match')).toBeInTheDocument();
    await waitFor(() => expect(hotelService.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'zzz', page: 1 })));
    expect(hotelService.list.mock.calls.filter(([p]) => p.search).length).toBe(1); // one request for the whole word, not one per letter
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(await screen.findByText('Hotel 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Search hotels')).toHaveValue('');
  });

  it('filters by city and rating and sorts, asking the server each time and starting from page 1', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    show();
    await screen.findByText('Hotel 1');
    expect(screen.getByRole('option', { name: 'Goa (2)' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Filter by city'), 'Goa');
    await waitFor(() => expect(hotelService.list).toHaveBeenLastCalledWith(expect.objectContaining({ city: 'Goa', page: 1 })));
    await userEvent.selectOptions(screen.getByLabelText('Filter by rating'), '4 star');
    await waitFor(() => expect(hotelService.list).toHaveBeenLastCalledWith(expect.objectContaining({ city: 'Goa', star: '4 star' })));
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'name');
    await waitFor(() => expect(hotelService.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name' })));
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await waitFor(() => expect(hotelService.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Archived' })));
  });

  it('offers a one-click way back to everything while any filter is on, and not otherwise', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    show();
    await screen.findByText('Hotel 1');
    expect(screen.queryByRole('button', { name: 'Reset filters' })).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Filter by city'), 'Goa');
    await userEvent.selectOptions(screen.getByLabelText('Filter by rating'), '4 star');
    await userEvent.click(await screen.findByRole('button', { name: 'Reset filters' }));
    expect(screen.getByLabelText('Filter by city')).toHaveValue('');
    expect(screen.getByLabelText('Filter by rating')).toHaveValue('');
    await waitFor(() => expect(hotelService.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ city: 'Goa' })));
    expect(screen.queryByRole('button', { name: 'Reset filters' })).toBeNull();
  });

  it('starts a quotation for an active hotel straight from its card, and not for an archived one or without the right', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1), hotel(2, { status: 'Archived' })]));
    show();
    await screen.findByText('Hotel 1');
    expect(screen.queryByRole('button', { name: 'Create quotation for Hotel 2' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Create quotation for Hotel 1' }));
    expect(h.navigate).toHaveBeenCalledWith('/quotations/new?hotelId=id1');
    cleanup();
    h.perms.quote = false;
    show();
    await screen.findByText('Hotel 1');
    expect(screen.queryByRole('button', { name: /Create quotation for/ })).toBeNull();
  });

  it('pages through long lists', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)], { total: 30, pages: 3 }));
    show();
    await screen.findByText('Hotel 1');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(hotelService.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('shows the server message when the list cannot be loaded, and lets the user retry', async () => {
    hotelService.list.mockResolvedValueOnce({ success: false, message: 'The server is busy.' }).mockResolvedValue(page([hotel(1)]));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('The server is busy.');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Hotel 1')).toBeInTheDocument();
  });

  it('archives and restores with a clear message, and deletes only after confirmation', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    hotelService.update.mockResolvedValue({ success: true });
    hotelService.remove.mockResolvedValue({ success: true });
    show();
    await screen.findByText('Hotel 1');

    await userEvent.click(screen.getByRole('button', { name: 'Archive Hotel 1' }));
    await waitFor(() => expect(hotelService.update).toHaveBeenCalledWith('id1', { status: 'Archived' }));
    expect(h.showToast).toHaveBeenCalledWith('Hotel 1 was archived. It stays saved and can be restored.', 'success');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Hotel 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Quotations that already used it keep their own copy/)).toBeInTheDocument();
    expect(hotelService.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete hotel' }));
    await waitFor(() => expect(hotelService.remove).toHaveBeenCalledWith('id1'));
    expect(h.showToast).toHaveBeenCalledWith('Hotel 1 was deleted.', 'success');
  });

  it('shows the server message when archiving fails', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    hotelService.update.mockResolvedValue({ success: false, message: 'This hotel was changed by Asha Rao while you were editing it.' });
    show();
    await screen.findByText('Hotel 1');
    await userEvent.click(screen.getByRole('button', { name: 'Archive Hotel 1' }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('This hotel was changed by Asha Rao while you were editing it.', 'error'));
  });

  it('hides delete without the right, and shows "View" instead of "Edit" and no archive for a hotel the user may not change', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    h.perms.delete = false;
    show();
    await screen.findByText('Hotel 1');
    expect(screen.queryByRole('button', { name: 'Delete Hotel 1' })).toBeNull();
    cleanup();

    h.perms.edit = false;
    show();
    await screen.findByText('Hotel 1');
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive Hotel 1' })).toBeNull();
  });
});

describe('HotelListPage: two sections and the hotel finder', () => {
  const foundRow = { _id: 'f1', name: 'Found Resort', propertyType: 'Resort', starRating: '4 star', address: { locality: 'Goa', country: 'India' }, status: 'Saved', sourceSite: 'foundresort.com', source: 'website', foundAt: '2026-11-03T10:00:00Z', createdByName: 'Asha Rao', photoCount: 0, completeness: { score: 50 } };

  it('has a "Find hotel info" button next to "Add hotel", for people who may add hotels', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    show();
    await screen.findByText('Hotel 1');
    await userEvent.click(screen.getByRole('button', { name: /find hotel info/i }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels/find');
    expect(screen.getByRole('button', { name: /add hotel/i })).toBeInTheDocument();
    h.perms.create = false;
    cleanup();
    show();
    await screen.findByText('Hotel 1');
    expect(screen.queryByRole('button', { name: /find hotel info/i })).toBeNull();
  });

  it('shows the hotels first and the found hotels in a second section of the same page, with their count', async () => {
    hotelService.list.mockResolvedValue(page([hotel(1)]));
    show();
    await screen.findByText('Hotel 1');
    const tabs = screen.getByRole('tablist', { name: 'Sections of the hotel list' });
    expect(within(tabs).getByRole('tab', { name: 'Hotels' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(within(tabs).getByRole('tab', { name: 'Found hotels (3)' })).toBeInTheDocument());
    hotelFinderService.list.mockResolvedValue({ success: true, data: [foundRow], total: 3, page: 1, limit: 12, pages: 1 });
    await userEvent.click(within(tabs).getByRole('tab', { name: /found hotels/i }));
    expect(await screen.findByText('Found Resort')).toBeInTheDocument();
    expect(screen.queryByText('Hotel 1')).toBeNull();
    expect(screen.queryByLabelText('Search hotels')).toBeNull();
    expect(screen.getByLabelText('Search found hotels')).toBeInTheDocument();
    expect(screen.getByText('3 found')).toBeInTheDocument();
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Hotels' }));
    expect(await screen.findByText('Hotel 1')).toBeInTheDocument();
  });

  it('opens straight on the found hotels when the address says so', async () => {
    hotelFinderService.list.mockResolvedValue({ success: true, data: [foundRow], total: 1, page: 1, limit: 12, pages: 1 });
    render(<MemoryRouter initialEntries={['/hotels?tab=found']}><HotelListPage /></MemoryRouter>);
    expect(await screen.findByText('Found Resort')).toBeInTheDocument();
    expect(hotelService.list).not.toHaveBeenCalled();
  });
});
