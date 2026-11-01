import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/hotelService', () => ({ default: { list: vi.fn(), get: vi.fn(), create: vi.fn() } }));
vi.mock('../../services/mediaService', () => ({ mediaUrl: (token, variant = 'full') => `/media/${token}${variant === 'thumb' ? '/thumb' : ''}` }));
import hotelService from '../../services/hotelService';
import HotelPicker from './HotelPicker';

const row = (id, over = {}) => ({ _id: id, name: `Hotel ${id}`, city: 'Ubud', country: 'Indonesia', area: '', starRating: '5 star', roomTypeCount: 3, photoCount: 4, cover: { token: `cover${id}`.padEnd(24, 'x') }, ...over });
const listOf = (rows, total = rows.length) => ({ success: true, data: rows, total, page: 1, pages: 1 });

const open = (props = {}) => {
  const onClose = vi.fn();
  const onPick = vi.fn(() => ({ ok: true }));
  render(<HotelPicker isOpen onClose={onClose} onPick={onPick} canAdd {...props} />);
  return { onClose, onPick };
};

beforeEach(() => {
  Object.values(hotelService).forEach((fn) => fn.mockReset());
});
afterEach(cleanup);

describe('HotelPicker', () => {
  it('lists the saved hotels with rating, place, rooms and photos', async () => {
    hotelService.list.mockResolvedValue(listOf([row('a'), row('b', { roomTypeCount: 1, photoCount: 1, starRating: 'Heritage / Palace', area: 'Centre' })]));
    open();
    expect(await screen.findByText('Hotel a')).toBeTruthy();
    expect(screen.getByText(/5 Star Luxury · Ubud, Indonesia · 3 room types · 4 photos/)).toBeTruthy();
    expect(screen.getByText(/Heritage \/ Palace · Centre, Ubud, Indonesia · 1 room type · 1 photo$/)).toBeTruthy();
    expect(hotelService.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'Active', sort: 'name', limit: 8 }));
  });

  it('asks the server only after typing pauses', async () => {
    hotelService.list.mockResolvedValue(listOf([row('a')]));
    open();
    await screen.findByText('Hotel a');
    hotelService.list.mockClear();
    await userEvent.type(screen.getByLabelText('Search the hotel list'), 'ubud');
    await waitFor(() => expect(hotelService.list).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(hotelService.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'ubud' }));
  });

  it('says so in plain words when there is nothing to show, and points to adding when that is allowed', async () => {
    hotelService.list.mockResolvedValue(listOf([]));
    open();
    expect(await screen.findByText(/The hotel list is empty\. You can add the hotel below\./)).toBeTruthy();
    cleanup();
    open({ canAdd: false });
    expect(await screen.findByText(/Ask someone with permission to add it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add it/i })).toBeNull();
  });

  it('shows the server message when the list cannot be loaded and lets the user try again', async () => {
    hotelService.list.mockResolvedValueOnce({ success: false, message: 'The server is busy.' }).mockResolvedValueOnce(listOf([row('a')]));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('The server is busy.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Hotel a')).toBeTruthy();
  });

  it('cannot be used until a hotel is chosen; then loads the whole hotel, hands it over and closes', async () => {
    hotelService.list.mockResolvedValue(listOf([row('a')]));
    hotelService.get.mockResolvedValue({ success: true, data: { _id: 'a', name: 'Hotel a', roomTypes: [] } });
    const { onPick, onClose } = open();
    await screen.findByText('Hotel a');
    expect(screen.getByRole('button', { name: 'Use this hotel' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Hotel a/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this hotel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(hotelService.get).toHaveBeenCalledWith('a');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ _id: 'a', name: 'Hotel a' }));
  });

  it('shows the reason and stays open when the hotel was removed meanwhile, or the pick is refused', async () => {
    hotelService.list.mockResolvedValue(listOf([row('a')]));
    hotelService.get.mockResolvedValueOnce({ success: false, message: 'Hotel not found. It may have been removed.' }).mockResolvedValue({ success: true, data: { _id: 'a', name: 'Hotel a' } });
    const refuse = vi.fn(() => ({ ok: false, message: 'This stay cannot take that hotel.' }));
    const { onClose } = open({ onPick: refuse });
    await userEvent.click(await screen.findByRole('radio', { name: /Hotel a/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this hotel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hotel not found. It may have been removed.');
    await userEvent.click(screen.getByRole('button', { name: 'Use this hotel' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This stay cannot take that hotel.'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('adds a hotel that is not in the list and uses it at once; only the name and the city are asked for', async () => {
    hotelService.list.mockResolvedValue(listOf([]));
    hotelService.create.mockResolvedValue({ success: true, data: { _id: 'new1', name: 'Ocean Pearl', city: 'Goa' } });
    const { onPick, onClose } = open();
    await userEvent.click(await screen.findByRole('button', { name: /The hotel is not in the list: add it/ }));

    await userEvent.click(screen.getByRole('button', { name: /Add to the list and use it/ }));
    expect(await screen.findByText('Please enter the name of the hotel.')).toBeInTheDocument();
    expect(screen.getByText('Please enter the city.')).toBeInTheDocument();
    expect(hotelService.create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Hotel name *'), 'Ocean Pearl');
    await userEvent.type(screen.getByLabelText('City *'), 'Goa');
    await userEvent.selectOptions(screen.getByLabelText('Rating'), '4 star');
    await userEvent.click(screen.getByRole('button', { name: /Add to the list and use it/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(hotelService.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ocean Pearl', city: 'Goa', starRating: '4 star', photos: [], roomTypes: [] }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ _id: 'new1' }));
  });

  it('shows the server message when the hotel is already in the list, and keeps what was typed', async () => {
    hotelService.list.mockResolvedValue(listOf([]));
    hotelService.create.mockResolvedValue({ success: false, message: '"Ocean Pearl" in Goa is already in the hotel list. Search for it instead of adding it again.' });
    const { onPick } = open();
    await userEvent.click(await screen.findByRole('button', { name: /The hotel is not in the list: add it/ }));
    await userEvent.type(screen.getByLabelText('Hotel name *'), 'ocean pearl');
    await userEvent.type(screen.getByLabelText('City *'), 'goa');
    await userEvent.click(screen.getByRole('button', { name: /Add to the list and use it/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in the hotel list. Search for it');
    expect(screen.getByLabelText('Hotel name *')).toHaveValue('ocean pearl');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('shows a readable message when the network fails while adding', async () => {
    hotelService.list.mockResolvedValue(listOf([]));
    hotelService.create.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    open();
    await userEvent.click(await screen.findByRole('button', { name: /The hotel is not in the list: add it/ }));
    await userEvent.type(screen.getByLabelText('Hotel name *'), 'Ocean Pearl');
    await userEvent.type(screen.getByLabelText('City *'), 'Goa');
    await userEvent.click(screen.getByRole('button', { name: /Add to the list and use it/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent.length).toBeGreaterThan(10);
    expect(alert.textContent).not.toMatch(/undefined|\[object/);
  });
});
