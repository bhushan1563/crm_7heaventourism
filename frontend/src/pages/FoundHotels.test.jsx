import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), perms: { create: true, delete: true, edit: true }, addFound: vi.fn() }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: (m, a) => (a === 'canCreate' ? h.perms.create : a === 'canDelete' ? h.perms.delete : true), canEditRecord: () => h.perms.edit })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => h.navigate }));
vi.mock('../services/hotelFinderService', () => ({ default: { list: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock('../utils/addFoundToHotels', () => ({ addFoundToHotelList: (...a) => h.addFound(...a) }));
vi.mock('../services/mediaService', () => ({ mediaUrl: (t, v = 'full') => `/media/${t}${v === 'thumb' ? '/thumb' : ''}` }));
vi.mock('../components/PhotoGallery', () => ({ default: ({ photos, label }) => <div>{label}: {photos.length}</div> }));
vi.mock('../utils/hotelFinderExport', () => ({ exportFoundCsv: vi.fn(async () => ({ ok: true })), exportFoundDocx: vi.fn(async () => ({})), exportFoundPdf: vi.fn(async () => ({})) }));

import hotelFinderService from '../services/hotelFinderService';
import { exportFoundCsv, exportFoundDocx, exportFoundPdf } from '../utils/hotelFinderExport';
import FoundHotelsSection from '../components/hotelFinder/FoundHotelsSection';
import FoundHotelPage, { toForm, toPayload, validate } from './FoundHotelPage';

const row = (n, over = {}) => ({ _id: `f${n}`, name: `Found ${n}`, propertyType: 'Resort', starRating: '4 star', address: { locality: 'Goa', country: 'India' }, phones: ['+91 1'], emails: [], sourceSite: `hotel${n}.com`, source: 'website', status: 'Saved', hotelId: '', foundAt: '2026-11-03T10:00:00Z', createdByName: 'Asha Rao', createdAt: '2026-11-03T10:00:00Z', completeness: { score: 60 }, photoCount: 3, cover: { token: 'c'.repeat(24), width: 10, height: 10 }, ...over });
const list = (data, over = {}) => ({ success: true, data, total: data.length, page: 1, limit: 12, pages: 1, ...over });

const record = (over = {}) => ({
  _id: 'f1', name: 'Palm Grove Resort', propertyType: 'Resort', starRating: '4 star', tagline: 'By the sea', description: 'A beachside resort.',
  address: { full: '12 Candolim Beach Road, Candolim, Goa 403515, India', street: '12 Candolim Beach Road', locality: 'Candolim', region: 'Goa', postalCode: '403515', country: 'India' },
  geo: { lat: 15.5, lng: 73.76 }, phones: ['+91 832 227 5599'], emails: ['stay@palmgrove.com'], website: 'https://palmgrove.com', social: [{ network: 'facebook', url: 'https://www.facebook.com/palmgrove' }],
  checkIn: '14:00', checkOut: '11:00', amenities: ['Pool', 'Spa'], rooms: [{ name: 'Sea View Room', details: 'A bright room.' }],
  rates: { currency: 'INR', from: 6500, to: 9000, unit: 'night', text: 'From Rs 6,500 per night', note: 'As printed.', lines: [] }, priceLevel: 0, guestRating: { value: 4.5, best: 5, count: 1200 },
  policies: { cancellation: 'Free until 7 days before.', children: '', pets: '' }, photos: [{ token: 'p'.repeat(24), width: 100, height: 100, caption: '' }], notes: '', tags: ['beach'],
  sourceUrl: 'https://palmgrove.com/', sourceSite: 'palmgrove.com', source: 'website', completeness: { score: 72, found: [], missing: [] }, warnings: ['Check the rates.'], fieldLevels: { name: 'high', phones: 'medium' },
  foundAt: '2026-11-03T10:00:00Z', status: 'Saved', hotelId: '', createdBy: 'u1', createdByName: 'Asha Rao', updatedByName: 'Asha Rao', updatedAt: '2026-11-03T11:00:00.000Z', ...over
});

beforeEach(() => {
  for (const fn of Object.values(hotelFinderService)) fn.mockReset();
  for (const fn of [exportFoundCsv, exportFoundDocx, exportFoundPdf]) fn.mockClear();
  h.showToast.mockReset();
  h.navigate.mockReset();
  Object.assign(h.perms, { create: true, delete: true, edit: true });
});
afterEach(cleanup);

describe('Found hotels (the second section of the hotel list)', () => {
  const show = (props = {}) => render(<MemoryRouter><FoundHotelsSection {...props} /></MemoryRouter>);

  it('shows the saved finds as cards with where they came from and how complete they are', async () => {
    hotelFinderService.list.mockResolvedValue(list([row(1), row(2, { status: 'Added', hotelId: 'h9', cover: null, photoCount: 0, source: 'pasted', address: {} })]));
    const onCount = vi.fn();
    show({ onCount });
    expect(await screen.findByText('Found 1')).toBeInTheDocument();
    const [a, b] = screen.getAllByRole('article');
    expect(within(a).getByText('Goa, India')).toBeInTheDocument();
    expect(within(a).getByText('hotel1.com')).toBeInTheDocument();
    expect(within(a).getByText('60/100 complete')).toBeInTheDocument();
    expect(within(a).getByText('Saved')).toBeInTheDocument();
    expect(within(b).getByText('In the hotel list')).toBeInTheDocument();
    expect(within(b).getByText('Location not found')).toBeInTheDocument();
    expect(within(b).getByText('pasted from hotel2.com')).toBeInTheDocument();
    expect(within(b).getByText('No picture')).toBeInTheDocument();
    expect(onCount).toHaveBeenCalledWith(2);
  });

  it('opens a card, adds a saved one to the hotel list, and opens the hotel of one that was added', async () => {
    hotelFinderService.list.mockResolvedValue(list([row(1), row(2, { status: 'Added', hotelId: 'h9' })]));
    show();
    await screen.findByText('Found 1');
    const [a, b] = screen.getAllByRole('article');
    await userEvent.click(within(a).getByRole('button', { name: /^Open Found 1$/ }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels/found/f1');
    hotelFinderService.get.mockResolvedValue({ success: true, data: { _id: 'f1', name: 'Found 1' } });
    h.addFound.mockResolvedValueOnce({ ok: true, hotel: { _id: 'h1' }, marked: true });
    await userEvent.click(within(a).getByRole('button', { name: /save to hotel list/i }));
    await waitFor(() => expect(h.addFound).toHaveBeenCalledWith({ _id: 'f1', name: 'Found 1' }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('Found 1 was added to the hotel list.', 'success'));
    expect(h.navigate).not.toHaveBeenCalledWith('/hotels/new?fromFound=f1');
    h.addFound.mockResolvedValueOnce({ ok: false, needsForm: true });
    await userEvent.click(within(a).getByRole('button', { name: /save to hotel list/i }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/hotels/new?fromFound=f1')); // required details missing: the form opens
    expect(within(b).queryByRole('button', { name: /save to hotel list/i })).toBeNull();
    await userEvent.click(within(b).getByRole('button', { name: /^hotel$/i }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels/h9/edit');
  });

  it('searches after typing pauses, filters by status, sorts and pages', async () => {
    hotelFinderService.list.mockResolvedValue(list([row(1)], { total: 30, pages: 3 }));
    show();
    await screen.findByText('Found 1');
    await userEvent.type(screen.getByLabelText('Search found hotels'), 'goa');
    await waitFor(() => expect(hotelFinderService.list).toHaveBeenLastCalledWith({ search: 'goa', sort: 'updated', page: 1, limit: 12 }));
    await userEvent.click(screen.getByRole('tab', { name: 'In the hotel list' }));
    await waitFor(() => expect(hotelFinderService.list).toHaveBeenLastCalledWith({ search: 'goa', status: 'Added', sort: 'updated', page: 1, limit: 12 }));
    await userEvent.selectOptions(screen.getByLabelText('Sort found hotels'), 'name');
    await waitFor(() => expect(hotelFinderService.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name' })));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(hotelFinderService.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    await userEvent.click(screen.getByRole('button', { name: /reset filters/i }));
    await waitFor(() => expect(hotelFinderService.list).toHaveBeenLastCalledWith({ sort: 'updated', page: 1, limit: 12 }));
  });

  it('says what to do when there is nothing yet, and when nothing matches', async () => {
    hotelFinderService.list.mockResolvedValue(list([]));
    show();
    expect(await screen.findByText('No found hotels yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /find hotel info/i }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels/find');
    await userEvent.type(screen.getByLabelText('Search found hotels'), 'zzz');
    expect(await screen.findByText('No found hotels match')).toBeInTheDocument();
  });

  it('a failure is shown with a way to try again', async () => {
    hotelFinderService.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(list([row(1)]));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('The found hotels could not be loaded.');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Found 1')).toBeInTheDocument();
  });

  it('removing asks first, and says what happened', async () => {
    hotelFinderService.list.mockResolvedValue(list([row(1)]));
    hotelFinderService.remove.mockResolvedValue({ success: true });
    show();
    await screen.findByText('Found 1');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Found 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('not affected');
    expect(hotelFinderService.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(hotelFinderService.remove).toHaveBeenCalledWith('f1'));
    expect(h.showToast).toHaveBeenCalledWith('Found 1 was removed from Found hotels.', 'success');
    h.perms.delete = false;
    cleanup();
    show();
    await screen.findByText('Found 1');
    expect(screen.queryByRole('button', { name: 'Remove Found 1' })).toBeNull();
  });
});

describe('a saved find: view, edit, download, add, remove', () => {
  const open = (id = 'f1') => render(<MemoryRouter initialEntries={[`/hotels/found/${id}`]}><Routes><Route path="/hotels/found/:id" element={<FoundHotelPage />} /></Routes></MemoryRouter>);

  it('shows everything that was found, how sure it was, where it came from, and the warnings', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    open();
    expect(await screen.findByRole('heading', { name: 'Palm Grove Resort' })).toBeInTheDocument();
    expect(screen.getByLabelText('Hotel name *')).toHaveValue('Palm Grove Resort');
    expect(screen.getByLabelText('Phone number 1')).toHaveValue('+91 832 227 5599');
    expect(screen.getByLabelText('Email address 1')).toHaveValue('stay@palmgrove.com');
    expect(screen.getByLabelText('City')).toHaveValue('Candolim');
    expect(screen.getByLabelText('Latitude')).toHaveValue('15.5');
    expect(screen.getByLabelText('Lowest rate')).toHaveValue(6500);
    expect(screen.getByLabelText('Room type 1')).toHaveValue('Sea View Room');
    expect(screen.getByText('Gallery: 1')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Check the rates.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /palmgrove.com/ })).toHaveAttribute('href', 'https://palmgrove.com/');
    expect(screen.getAllByRole('img', { name: 'Sure' }).length).toBeGreaterThan(0);
    expect(screen.getByText('All changes are saved.')).toBeInTheDocument();
  });

  it('editing marks the page unsaved, and Save sends only what is valid, with the version it was loaded at', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    hotelFinderService.update.mockImplementation(async (id, payload) => ({ success: true, data: record({ ...payload, updatedAt: '2026-11-03T12:00:00.000Z' }) }));
    open();
    await screen.findByRole('heading', { name: 'Palm Grove Resort' });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('City'));
    await userEvent.type(screen.getByLabelText('City'), 'Calangute');
    await userEvent.click(screen.getByRole('button', { name: /add a phone number/i }));
    await userEvent.type(screen.getByLabelText('Phone number 2'), '+91 98290 12345');
    await userEvent.click(screen.getByRole('button', { name: /add a room type/i })); // a blank row is dropped when saving
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save to hotel list/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(hotelFinderService.update).toHaveBeenCalledTimes(1));
    const [id, payload] = hotelFinderService.update.mock.calls[0];
    expect(id).toBe('f1');
    expect(payload.updatedAt).toBe('2026-11-03T11:00:00.000Z');
    expect(payload.address.locality).toBe('Calangute');
    expect(payload.phones).toEqual(['+91 832 227 5599', '+91 98290 12345']);
    expect(payload.rooms).toEqual([{ name: 'Sea View Room', details: 'A bright room.' }]);
    expect(payload.geo).toEqual({ lat: 15.5, lng: 73.76 });
    expect(payload.rates).toMatchObject({ currency: 'INR', from: 6500, to: 9000, unit: 'night' });
    expect(h.showToast).toHaveBeenCalledWith('Saved.', 'success');
    expect(await screen.findByText('All changes are saved.')).toBeInTheDocument();
  });

  it('problems are shown next to their fields and nothing is sent', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    open();
    await screen.findByRole('heading', { name: 'Palm Grove Resort' });
    await userEvent.clear(screen.getByLabelText('Hotel name *'));
    await userEvent.clear(screen.getByLabelText('Latitude'));
    await userEvent.type(screen.getByLabelText('Phone number 1'), 'x');
    await userEvent.clear(screen.getByLabelText('Email address 1'));
    await userEvent.type(screen.getByLabelText('Email address 1'), 'nope');
    await userEvent.clear(screen.getByLabelText('Guest rating'));
    await userEvent.type(screen.getByLabelText('Guest rating'), '9');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(hotelFinderService.update).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent).join(' | ');
    for (const part of ['Please enter the name of the hotel.', 'may only contain digits', 'does not look right', 'Enter both the latitude and the longitude', 'guest rating must be above 0']) expect(alerts).toContain(part);
    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/Please fix the 5 highlighted fields/), 'warning');
  });

  it('a conflict or a refusal from the server is shown, and the edits stay on the page', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    hotelFinderService.update.mockResolvedValue({ success: false, message: 'This found hotel was changed by Omar while you were editing it. Please reload to see their changes.' });
    open();
    await screen.findByRole('heading', { name: 'Palm Grove Resort' });
    await userEvent.type(screen.getByLabelText('Tagline'), '!');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/changed by Omar while you were editing it/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tagline')).toHaveValue('By the sea!');
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
  });

  it('someone who may not edit can look but not change', async () => {
    h.perms.edit = false;
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    open();
    expect(await screen.findByText(/You can view this hotel but not change it/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hotel name *')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove phone number/i })).toBeNull();
  });

  it('adds the hotel to the hotel list, or opens the hotel it already became', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    open();
    h.addFound.mockResolvedValueOnce({ ok: false, needsForm: true });
    await userEvent.click(await screen.findByRole('button', { name: /save to hotel list/i }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/hotels/new?fromFound=f1'));
    cleanup();
    hotelFinderService.get.mockResolvedValue({ success: true, data: record({ status: 'Added', hotelId: 'h77' }) });
    open();
    expect(await screen.findByText('In the hotel list')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save to hotel list/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /open in the hotel list/i }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels/h77/edit');
  });

  it('downloads what is on the page right now (Word, PDF, CSV)', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    open();
    await screen.findByRole('heading', { name: 'Palm Grove Resort' });
    await userEvent.clear(screen.getByLabelText('Hotel name *'));
    await userEvent.type(screen.getByLabelText('Hotel name *'), 'Palm Grove Resort & Spa');
    await userEvent.click(screen.getByRole('button', { name: /^word$/i }));
    await waitFor(() => expect(exportFoundDocx).toHaveBeenCalledTimes(1));
    expect(exportFoundDocx.mock.calls[0][0]).toMatchObject({ name: 'Palm Grove Resort & Spa', sourceUrl: 'https://palmgrove.com/', warnings: ['Check the rates.'] });
    await userEvent.click(screen.getByRole('button', { name: /^pdf$/i }));
    await waitFor(() => expect(exportFoundPdf).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: /^csv$/i }));
    await waitFor(() => expect(exportFoundCsv).toHaveBeenCalledTimes(1));
  });

  it('removing asks first and goes back to Found hotels', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: record() });
    hotelFinderService.remove.mockResolvedValue({ success: true });
    open();
    await userEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(hotelFinderService.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(hotelFinderService.remove).toHaveBeenCalledWith('f1'));
    expect(h.navigate).toHaveBeenCalledWith('/hotels?tab=found', { replace: true });
  });

  it('a find that cannot be opened says so and can be tried again', async () => {
    hotelFinderService.get.mockResolvedValueOnce({ success: false, message: 'This found hotel could not be found. It may have been removed.' }).mockResolvedValue({ success: true, data: record() });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be found');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'Palm Grove Resort' })).toBeInTheDocument();
  });
});

describe('the form and the record', () => {
  it('a record that is not touched gives back what it was (no change is invented)', () => {
    const r = record();
    const p = toPayload(toForm(r));
    expect(p).toMatchObject({ name: r.name, phones: r.phones, emails: r.emails, geo: r.geo, checkIn: '14:00', amenities: r.amenities, tags: r.tags, notes: '' });
    expect(p.photos).toEqual([{ token: r.photos[0].token, caption: '' }]);
    expect(validate(toForm(r))).toEqual({});
  });
  it('property: any record round-trips through the form and passes its own checks', () => {
    const arb = fc.record({
      name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim()), phones: fc.array(fc.constantFrom('+91 98290 12345', '0294 242 8800'), { maxLength: 3 }), emails: fc.array(fc.constantFrom('a@hotel.com', 'b@hotel.in'), { maxLength: 3 }),
      geo: fc.option(fc.record({ lat: fc.double({ min: -90, max: 90, noNaN: true }).map((v) => (Object.is(v, -0) ? 0 : v)), lng: fc.double({ min: -180, max: 180, noNaN: true }).map((v) => (Object.is(v, -0) ? 0 : v)) }), { nil: null }),
      rates: fc.option(fc.record({ currency: fc.constant('INR'), from: fc.integer({ min: 1, max: 100000 }), to: fc.integer({ min: 1, max: 100000 }), unit: fc.constantFrom('night', 'person'), text: fc.string({ maxLength: 20 }), note: fc.string({ maxLength: 20 }), lines: fc.constant([]) }), { nil: null }),
      guestRating: fc.option(fc.record({ value: fc.integer({ min: 1, max: 5 }), best: fc.constant(5), count: fc.integer({ min: 0, max: 5000 }) }), { nil: null })
    });
    fc.assert(fc.property(arb, (r) => {
      const form = toForm(record(r));
      expect(validate(form)).toEqual({});
      const p = toPayload(form);
      expect(p.phones).toEqual(r.phones);
      expect(p.geo).toEqual(r.geo);
      if (r.rates) expect(p.rates.from).toBe(r.rates.from);
      else expect(p.rates).toBeNull();
      if (r.guestRating) expect(p.guestRating.value).toBe(r.guestRating.value);
      else expect(p.guestRating).toBeNull();
    }), { numRuns: 200 });
  });
});
