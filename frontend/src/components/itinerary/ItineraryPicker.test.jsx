import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/itineraryService', () => ({ default: { list: vi.fn(), get: vi.fn() } }));
vi.mock('../../services/mediaService', () => ({ mediaUrl: (token, variant = 'full') => `/media/${token}${variant === 'thumb' ? '/thumb' : ''}` }));
import itineraryService from '../../services/itineraryService';
import ItineraryPicker from './ItineraryPicker';

const row = (id, over = {}) => ({ _id: id, title: `Itinerary ${id}`, destination: 'Bali', country: 'Indonesia', nights: 3, dayCount: 4, photoCount: 5, cover: { token: `cover${id}`.padEnd(24, 'x') }, ...over });
const listOf = (rows, total = rows.length) => ({ success: true, data: rows, total, page: 1, pages: 1 });
const full = (id) => ({ success: true, data: { _id: id, title: `Itinerary ${id}`, destination: 'Bali', nights: 3, days: [{ title: 'Arrival' }] } });

const open = (props = {}) => {
  const onClose = vi.fn();
  const onInsert = vi.fn(() => ({ ok: true }));
  render(<ItineraryPicker isOpen onClose={onClose} onInsert={onInsert} currentDayCount={0} {...props} />);
  return { onClose, onInsert };
};

beforeEach(() => {
  itineraryService.list.mockReset();
  itineraryService.get.mockReset();
});
afterEach(cleanup);

describe('ItineraryPicker', () => {
  it('lists the saved itineraries with their destination, length, days and photos', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a'), row('b', { dayCount: 1, photoCount: 1, nights: 1, country: '' })]));
    open();
    expect(await screen.findByText('Itinerary a')).toBeTruthy();
    expect(screen.getByText(/Bali, Indonesia · 3 Nights \/ 4 Days · 4 days · 5 photos/)).toBeTruthy();
    expect(screen.getByText(/Bali · 1 Night \/ 2 Days · 1 day · 1 photo$/)).toBeTruthy();
    expect(itineraryService.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'Active', sort: 'updated', limit: 8 }));
  });

  it('asks the server only after typing pauses, with what was typed', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')]));
    open();
    await screen.findByText('Itinerary a');
    itineraryService.list.mockClear();
    await userEvent.type(screen.getByLabelText('Search the itinerary library'), 'bali');
    await waitFor(() => expect(itineraryService.list).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(itineraryService.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'bali' }));
  });

  it('says so, in plain words, when there is nothing to show', async () => {
    itineraryService.list.mockResolvedValue(listOf([]));
    open();
    expect(await screen.findByText(/library is empty/i)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Search the itinerary library'), 'zzz');
    expect(await screen.findByText('No itinerary matches your search.', undefined, { timeout: 2000 })).toBeTruthy();
  });

  it('shows the server message when the library cannot be loaded and lets the user try again', async () => {
    itineraryService.list.mockResolvedValueOnce({ success: false, message: 'The server is busy.' }).mockResolvedValueOnce(listOf([row('a')]));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('The server is busy.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Itinerary a')).toBeTruthy();
  });

  it('tells how many more there are when the list is cut short', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')], 30));
    open();
    expect(await screen.findByText(/Showing 1 of 30/)).toBeTruthy();
  });

  it('cannot insert until one is chosen', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')]));
    open();
    await screen.findByText('Itinerary a');
    expect(screen.getByRole('button', { name: 'Insert itinerary' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Itinerary a/ }));
    expect(screen.getByRole('button', { name: 'Insert itinerary' })).toBeEnabled();
  });

  it('into an empty quotation: loads the full itinerary and inserts it, then closes', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')]));
    itineraryService.get.mockResolvedValue(full('a'));
    const { onInsert, onClose } = open({ currentDayCount: 0 });
    await userEvent.click(await screen.findByRole('radio', { name: /Itinerary a/ }));
    expect(screen.getByText(/Its 4 days will be added to this quotation/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Insert itinerary' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(itineraryService.get).toHaveBeenCalledWith('a');
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ _id: 'a', days: expect.any(Array) }), { mode: 'replace', copyLists: false, fillDetails: true });
  });

  it('into a quotation that already has days: adds after them by default, and can replace them when asked', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')]));
    itineraryService.get.mockResolvedValue(full('a'));
    const { onInsert } = open({ currentDayCount: 3 });
    await userEvent.click(await screen.findByRole('radio', { name: /Itinerary a/ }));
    expect(screen.getByRole('radio', { name: /Add its days after the 3 days already here/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /Replace the days already here/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /inclusions and exclusions/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /destination and duration/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Insert itinerary' }));
    await waitFor(() => expect(onInsert).toHaveBeenCalled());
    expect(onInsert.mock.calls[0][1]).toEqual({ mode: 'replace', copyLists: true, fillDetails: false });
  });

  it('stays open and shows the reason when the insert is refused', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')]));
    itineraryService.get.mockResolvedValue(full('a'));
    const { onClose } = open({ onInsert: vi.fn(() => ({ ok: false, message: 'A quotation can have at most 60 days, and this would make 61.' })) });
    await userEvent.click(await screen.findByRole('radio', { name: /Itinerary a/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Insert itinerary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 60 days, and this would make 61');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the server message when the chosen itinerary can no longer be opened', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')]));
    itineraryService.get.mockResolvedValue({ success: false, message: 'Itinerary not found. It may have been removed.' });
    const { onInsert, onClose } = open();
    await userEvent.click(await screen.findByRole('radio', { name: /Itinerary a/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Insert itinerary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Itinerary not found. It may have been removed.');
    expect(onInsert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a readable message when the network fails', async () => {
    itineraryService.list.mockResolvedValue(listOf([row('a')]));
    itineraryService.get.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    open();
    await userEvent.click(await screen.findByRole('radio', { name: /Itinerary a/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Insert itinerary' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent.length).toBeGreaterThan(10);
    expect(alert.textContent).not.toMatch(/undefined|\[object/);
  });
});
