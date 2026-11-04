import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), perms: { create: true, delete: true, edit: true, quote: true } }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    can: (m, a) => (m === 'quotations' ? h.perms.quote : a === 'canCreate' ? h.perms.create : a === 'canDelete' ? h.perms.delete : true),
    canEditRecord: () => h.perms.edit
  })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => {
  const real = await orig();
  return { ...real, useNavigate: () => { const go = real.useNavigate(); return (to, opts) => (String(to).startsWith('/quotations') ? h.navigate(to) : go(to, opts)); } };
});
vi.mock('../services/hotelService', () => ({ default: { get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock('../services/hotelFinderService', () => ({ default: { get: vi.fn(), markAdded: vi.fn() } }));
// The real editor and gallery have their own tests; here they are simple stand-ins so this file tests the page's logic.
vi.mock('../components/LazyRichTextEditor', () => ({
  default: ({ value, onChange, ariaLabel }) => <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
}));
vi.mock('../components/PhotoGallery', () => ({
  default: ({ photos, onChange, label }) => (
    <div>
      <span>{label}: {photos.length}</span>
      <button type="button" onClick={() => onChange([...photos, { token: 'N'.repeat(24), width: 1, height: 1, caption: '' }])}>add photo</button>
    </div>
  )
}));

import hotelService from '../services/hotelService';
import hotelFinderService from '../services/hotelFinderService';
import HotelEditorPage from './HotelEditorPage';

const stored = (over = {}) => ({
  _id: 'abc123',
  name: 'The Ubud Retreat',
  city: 'Ubud',
  country: 'Indonesia',
  area: '',
  address: '',
  starRating: '5 star',
  description: '<p>Lovely</p>',
  photos: [],
  contactPerson: '',
  phone: '+62 361 123',
  email: '',
  website: '',
  checkInTime: '14:00',
  checkOutTime: '11:00',
  amenities: ['Pool'],
  roomTypes: [{ name: 'Deluxe', details: 'King bed' }],
  mealPlans: ['CP (Breakfast Only)'],
  cancellationPolicy: '',
  notes: '',
  tags: ['beach'],
  status: 'Active',
  createdBy: 'u1',
  updatedAt: '2026-10-30T10:00:00.000Z',
  ...over
});

const nameField = () => screen.getByLabelText('Hotel name *');
const cityField = () => screen.getByLabelText('City *');

const open = (path = '/hotels/new') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/hotels" element={<p>LIST</p>} />
        <Route path="/hotels/new" element={<HotelEditorPage />} />
        <Route path="/hotels/:id/edit" element={<HotelEditorPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  Object.values(hotelService).forEach((fn) => fn.mockReset());
  h.showToast.mockReset();
  Object.assign(h.perms, { create: true, delete: true, edit: true, quote: true });
  h.navigate.mockReset();
});
afterEach(cleanup);

describe('adding a hotel', () => {
  it('shows what is missing next to each field, focuses the first one, and does not call the server', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    expect(await screen.findByText('Please enter the name of the hotel.')).toBeInTheDocument();
    expect(screen.getByText('Please enter the city.')).toBeInTheDocument();
    expect(h.showToast).toHaveBeenCalledWith('Please fix the 2 highlighted fields before saving.', 'warning');
    expect(hotelService.create).not.toHaveBeenCalled();
    expect(nameField()).toHaveFocus();
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(nameField(), 'Ocean Pearl');
    expect(screen.queryByText('Please enter the name of the hotel.')).toBeNull();
  });

  it('catches a bad email, phone or website before saving and says what is wrong', async () => {
    open();
    await userEvent.type(nameField(), 'Ocean Pearl');
    await userEvent.type(cityField(), 'Goa');
    await userEvent.type(screen.getByLabelText('Phone'), 'call me');
    await userEvent.type(screen.getByLabelText('Email'), 'nope');
    await userEvent.type(screen.getByLabelText('Website'), 'not a site');
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    expect(await screen.findByText(/only contain digits/)).toBeInTheDocument();
    expect(screen.getByText('The email address does not look right. Please check it.')).toBeInTheDocument();
    expect(screen.getByText(/website address does not look right/)).toBeInTheDocument();
    expect(hotelService.create).not.toHaveBeenCalled();
  });

  it('saves exactly what was entered, then shows the saved hotel without loading it again', async () => {
    hotelService.create.mockResolvedValue({ success: true, data: stored() });
    open();
    await userEvent.type(nameField(), 'The Ubud Retreat');
    await userEvent.type(cityField(), 'Ubud');
    await userEvent.selectOptions(screen.getByLabelText('Rating'), '4 star');
    await userEvent.type(screen.getByLabelText('Add a tag'), 'Beach{enter}');
    await userEvent.type(screen.getByLabelText('Add an amenity'), 'Rooftop Bar{enter}');
    await userEvent.click(screen.getByRole('button', { name: '+ Free WiFi' }));
    await userEvent.type(screen.getByLabelText('Cancellation policy'), 'Free until 7 days before');
    await userEvent.click(screen.getByRole('button', { name: 'add photo' }));

    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    await waitFor(() => expect(hotelService.create).toHaveBeenCalledTimes(1));
    expect(hotelService.create.mock.calls[0][0]).toMatchObject({
      name: 'The Ubud Retreat',
      city: 'Ubud',
      starRating: '4 star',
      tags: ['beach'],
      amenities: ['Rooftop Bar', 'Free WiFi'],
      cancellationPolicy: 'Free until 7 days before',
      photos: [{ token: 'N'.repeat(24), caption: '' }],
      checkInTime: '14:00',
      status: 'Active'
    });
    expect(h.showToast).toHaveBeenCalledWith('Hotel added to the list.', 'success');
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hotelService.get).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading the hotel…')).toBeNull();
  });

  it('shows the server message and keeps the work when the hotel is already in the list', async () => {
    hotelService.create.mockResolvedValue({ success: false, message: '"Ocean Pearl" in Goa is already in the hotel list. Search for it instead of adding it again.' });
    open();
    await userEvent.type(nameField(), 'Ocean Pearl');
    await userEvent.type(cityField(), 'Goa');
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('"Ocean Pearl" in Goa is already in the hotel list');
    expect(nameField()).toHaveValue('Ocean Pearl');
    expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('already in the hotel list'), 'error');
  });

  it('survives a network failure with a plain message', async () => {
    hotelService.create.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    open();
    await userEvent.type(nameField(), 'Ocean Pearl');
    await userEvent.type(cityField(), 'Goa');
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent.length).toBeGreaterThan(10);
    expect(alert.textContent).not.toMatch(/undefined|\[object/);
    expect(nameField()).toHaveValue('Ocean Pearl');
  });

  it('has no Rooms and meals section: room types and meal plans are not asked for, and a new hotel is saved without them', async () => {
    hotelService.create.mockResolvedValue({ success: true, data: stored() });
    open();
    expect(screen.queryByRole('heading', { name: 'Rooms and meals' })).toBeNull();
    expect(screen.queryByText(/Rates are entered in each quotation/)).toBeNull();
    expect(screen.queryByRole('button', { name: /add a room type/i })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Meal plans offered' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.type(nameField(), 'Ocean Pearl');
    await userEvent.type(cityField(), 'Goa');
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    await waitFor(() => expect(hotelService.create).toHaveBeenCalledTimes(1));
    const sent = hotelService.create.mock.calls[0][0];
    expect(sent).not.toHaveProperty('roomTypes');
    expect(sent).not.toHaveProperty('mealPlans');
  });

  it('stops suggesting an amenity that is already there', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: '+ Spa' }));
    expect(screen.queryByRole('button', { name: '+ Spa' })).toBeNull();
    expect(screen.getByText('Spa', { selector: '.tag-chip' })).toBeInTheDocument();
  });
});

describe('editing a hotel', () => {
  it('loads the record, flags changes, saves with the version it was loaded at, and shows it as saved', async () => {
    hotelService.get.mockResolvedValue({ success: true, data: stored() });
    hotelService.update.mockResolvedValue({ success: true, data: stored({ phone: '+62 361 999', updatedAt: '2026-10-30T11:00:00.000Z' }) });
    open('/hotels/abc123/edit');
    expect(await screen.findByRole('heading', { name: 'The Ubud Retreat' })).toBeInTheDocument();
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();

    const phone = screen.getByLabelText('Phone');
    await userEvent.clear(phone);
    await userEvent.type(phone, '+62 361 999');
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(hotelService.update).toHaveBeenCalledWith('abc123', expect.objectContaining({ phone: '+62 361 999', updatedAt: '2026-10-30T10:00:00.000Z' })));
    expect(h.showToast).toHaveBeenCalledWith('Hotel saved.', 'success');
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('leaves the room types and meal plans of an older hotel alone: not shown, and not sent, so the server keeps them', async () => {
    hotelService.get.mockResolvedValue({ success: true, data: stored() }); // stored() has a Deluxe room and the CP meal plan
    hotelService.update.mockResolvedValue({ success: true, data: stored({ phone: '+62 361 999' }) });
    open('/hotels/abc123/edit');
    await screen.findByRole('heading', { name: 'The Ubud Retreat' });
    expect(screen.queryByDisplayValue('Deluxe')).toBeNull();
    expect(screen.queryByText('Deluxe')).toBeNull();
    const phone = screen.getByLabelText('Phone');
    await userEvent.clear(phone);
    await userEvent.type(phone, '+62 361 999');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(hotelService.update).toHaveBeenCalledTimes(1));
    const sent = hotelService.update.mock.calls[0][1];
    expect(sent).not.toHaveProperty('roomTypes');
    expect(sent).not.toHaveProperty('mealPlans');
    expect(sent.phone).toBe('+62 361 999');
  });

  it('tells the user when someone else saved first, and offers the latest version after confirming', async () => {
    hotelService.get.mockResolvedValueOnce({ success: true, data: stored() }).mockResolvedValue({ success: true, data: stored({ phone: 'from someone else', updatedAt: '2026-10-30T12:00:00.000Z' }) });
    hotelService.update.mockResolvedValue({ success: false, message: 'This hotel was changed by Asha Rao while you were editing it. Please reload to see their changes before saving.' });
    open('/hotels/abc123/edit');
    await screen.findByText('All changes saved');
    await userEvent.type(screen.getByLabelText('Area'), 'Centre');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/changed by Asha Rao while you were editing it/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /load the latest version/i })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/replaces what is on this page/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Load the latest version' }));
    await waitFor(() => expect(screen.getByLabelText('Phone')).toHaveValue('from someone else'));
    expect(screen.getByLabelText('Area')).toHaveValue('');
  });

  it('asks before throwing away unsaved changes, and leaves at once when nothing was changed', async () => {
    hotelService.get.mockResolvedValue({ success: true, data: stored() });
    open('/hotels/abc123/edit');
    await screen.findByText('All changes saved');
    await userEvent.type(screen.getByLabelText('Area'), 'x');
    await userEvent.click(screen.getByRole('button', { name: /hotel list/i }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Leave without saving?')).toBeNull();
    expect(screen.getByLabelText('Area')).toHaveValue('x');
    cleanup();

    open('/hotels/abc123/edit');
    await screen.findByText('All changes saved');
    await userEvent.click(screen.getByRole('button', { name: /hotel list/i }));
    expect(await screen.findByText('LIST')).toBeInTheDocument();
  });

  it('starts a quotation for the saved hotel, but only when nothing is waiting to be saved, the hotel is active and the user may create quotations', async () => {
    hotelService.get.mockResolvedValue({ success: true, data: stored() });
    open('/hotels/abc123/edit');
    await screen.findByText('All changes saved');
    await userEvent.click(screen.getByRole('button', { name: /create quotation/i }));
    expect(h.navigate).toHaveBeenCalledWith('/quotations/new?hotelId=abc123');
    await userEvent.type(screen.getByLabelText('Area'), 'x');
    expect(screen.getByRole('button', { name: /create quotation/i })).toBeDisabled();
    cleanup();

    hotelService.get.mockResolvedValue({ success: true, data: stored({ status: 'Archived' }) });
    open('/hotels/abc123/edit');
    await screen.findByText('All changes saved');
    expect(screen.queryByRole('button', { name: /create quotation/i })).toBeNull();
    cleanup();

    h.perms.quote = false;
    hotelService.get.mockResolvedValue({ success: true, data: stored() });
    open('/hotels/abc123/edit');
    await screen.findByText('All changes saved');
    expect(screen.queryByRole('button', { name: /create quotation/i })).toBeNull();
  });

  it('explains when the hotel no longer exists', async () => {
    hotelService.get.mockResolvedValue({ success: false, message: 'Hotel not found. It may have been removed.' });
    open('/hotels/abc123/edit');
    expect(await screen.findByText('This hotel cannot be opened')).toBeInTheDocument();
    expect(screen.getByText('Hotel not found. It may have been removed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to the hotel list/i })).toBeInTheDocument();
  });

  it('is read-only for someone who may not edit it, and says why', async () => {
    hotelService.get.mockResolvedValue({ success: true, data: stored() });
    h.perms.edit = false;
    open('/hotels/abc123/edit');
    expect(await screen.findByText(/You can view this hotel but not change it/)).toBeInTheDocument();
    expect(nameField()).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /archive/i })).toBeNull();
  });

  it('archives and restores, refuses while there are unsaved changes, and deletes only after confirmation', async () => {
    hotelService.get.mockResolvedValue({ success: true, data: stored() });
    hotelService.update.mockResolvedValue({ success: true, data: stored({ status: 'Archived' }) });
    hotelService.remove.mockResolvedValue({ success: true });
    open('/hotels/abc123/edit');
    await screen.findByText('All changes saved');

    await userEvent.type(screen.getByLabelText('Area'), 'x');
    expect(screen.getByRole('button', { name: /archive/i })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Area'));
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    await waitFor(() => expect(hotelService.update).toHaveBeenCalledWith('abc123', { status: 'Archived' }));
    expect(h.showToast).toHaveBeenCalledWith('The hotel was archived. It stays saved and can be restored.', 'success');
    expect(await screen.findByRole('button', { name: /restore/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/keep their own copy/)).toBeInTheDocument();
    expect(hotelService.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete hotel' }));
    await waitFor(() => expect(hotelService.remove).toHaveBeenCalledWith('abc123'));
    expect(await screen.findByText('LIST')).toBeInTheDocument();
  });
});

describe('HotelEditorPage: adding a found hotel to the hotel list', () => {
  const found = (over = {}) => ({
    _id: 'f1', name: 'Palm Grove Resort', starRating: '4 star', description: 'A beachside resort.\n\nTwo pools.', address: { full: '12 Candolim Beach Road, Candolim, Goa, India', street: '12 Candolim Beach Road', locality: 'Candolim', region: 'Goa', postalCode: '', country: 'India' },
    phones: ['+91 832 227 5599'], emails: ['stay@palmgrove.com'], website: 'https://palmgrove.com', checkIn: '15:00', checkOut: '10:00', amenities: ['Pool', 'Spa'], sourceUrl: 'https://palmgrove.com/', rates: null,
    policies: { cancellation: 'Free until 7 days before.' }, photos: [{ token: 'P'.repeat(24), width: 10, height: 10, caption: 'Front' }], status: 'Saved', ...over
  });

  beforeEach(() => {
    hotelFinderService.get.mockReset();
    hotelFinderService.markAdded.mockReset();
    hotelFinderService.markAdded.mockResolvedValue({ success: true });
  });

  it('starts from what was found, says so, and keeps what the find did not give empty for the person to fill', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: found({ address: { full: '', street: '', locality: '', region: '', postalCode: '', country: '' } }) });
    open('/hotels/new?fromFound=f1');
    expect(await screen.findByTestId('found-banner')).toHaveTextContent('Filled in from the found hotel Palm Grove Resort');
    expect(screen.getByTestId('found-banner')).toHaveTextContent('fill in what the find did not give: the city');
    expect(nameField()).toHaveValue('Palm Grove Resort');
    expect(cityField()).toHaveValue('');
    expect(screen.getByLabelText('Phone')).toHaveValue('+91 832 227 5599');
    expect(screen.getByLabelText('Check-in time')).toHaveValue('15:00');
    expect(screen.getByText('Gallery: 1')).toBeInTheDocument();
    expect(hotelService.get).not.toHaveBeenCalled();
    await waitFor(() => expect(cityField()).toHaveFocus());
    // the city is required: saving without it is refused in words
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    expect(await screen.findByText('Please enter the city.')).toBeInTheDocument();
    expect(hotelService.create).not.toHaveBeenCalled();
  });

  it('saving adds the hotel with the found details and marks the found hotel as added', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: found() });
    hotelService.create.mockImplementation(async (payload) => ({ success: true, data: stored({ ...payload, _id: 'newhotel' }) }));
    open('/hotels/new?fromFound=f1');
    await screen.findByTestId('found-banner');
    expect(cityField()).toHaveValue('Candolim');
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    await waitFor(() => expect(hotelService.create).toHaveBeenCalledTimes(1));
    const payload = hotelService.create.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Palm Grove Resort', city: 'Candolim', country: 'India', phone: '+91 832 227 5599', email: 'stay@palmgrove.com', checkInTime: '15:00', checkOutTime: '10:00', starRating: '4 star' });
    expect(payload.photos).toEqual([{ token: 'P'.repeat(24), caption: 'Front' }]);
    expect(payload.description).toBe('<p>A beachside resort.</p><p>Two pools.</p>');
    await waitFor(() => expect(hotelFinderService.markAdded).toHaveBeenCalledWith('f1', 'newhotel'));
  });

  it('a found hotel that is already in the list is not added twice, and one that cannot be opened leaves the form empty with the reason', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: found({ status: 'Added', hotelId: 'h1' }) });
    open('/hotels/new?fromFound=f1');
    expect(await screen.findByText('This found hotel is already in the hotel list.')).toBeInTheDocument();
    expect(nameField()).toHaveValue('');
    cleanup();
    hotelFinderService.get.mockResolvedValue({ success: false, message: 'This found hotel could not be found. It may have been removed.' });
    open('/hotels/new?fromFound=zz');
    expect(await screen.findByText('This found hotel could not be found. It may have been removed.')).toBeInTheDocument();
    expect(nameField()).toHaveValue('');
  });

  it('a note that could not be saved on the found hotel is mentioned, but the hotel is still added', async () => {
    hotelFinderService.get.mockResolvedValue({ success: true, data: found() });
    hotelFinderService.markAdded.mockResolvedValue({ success: false, message: 'x' });
    hotelService.create.mockImplementation(async (payload) => ({ success: true, data: stored({ ...payload, _id: 'newhotel' }) }));
    open('/hotels/new?fromFound=f1');
    await screen.findByTestId('found-banner');
    await userEvent.click(screen.getByRole('button', { name: /add hotel/i }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('The hotel was added, but the found hotel could not be marked as added.', 'warning'));
    expect(h.showToast).toHaveBeenCalledWith('Hotel added to the list.', 'success');
  });
});
