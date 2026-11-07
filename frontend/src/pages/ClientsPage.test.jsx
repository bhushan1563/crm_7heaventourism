import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ current: vi.fn(), future: vi.fn(), create: vi.fn(), update: vi.fn(), updateCurrent: vi.fn(), del: vi.fn(), showToast: vi.fn(), copy: vi.fn(), rights: { create: true, update: true, delete: true }, editable: true }));
vi.mock('../services/clientService', () => ({
  default: { getCurrent: (...a) => h.current(...a), getFuture: (...a) => h.future(...a), createFuture: (...a) => h.create(...a), updateFuture: (...a) => h.update(...a), updateCurrentContact: (...a) => h.updateCurrent(...a), deleteFuture: (...a) => h.del(...a) }
}));
vi.mock('../services/api', () => ({ getErrorMessage: (e, f) => e?.message || f, default: {} }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: (m, a) => (a === 'canCreate' ? h.rights.create : a === 'canUpdate' ? h.rights.update : a === 'canDelete' ? h.rights.delete : true), canEditRecord: () => h.editable })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
import ClientsPage from './ClientsPage';

const CURRENT = [
  { id: 'e:aarav@example.com', name: 'Aarav Mehta', emails: ['aarav@example.com', 'aarav.work@example.com'], phones: ['+91 98765 43210'], inquiries: 2, bookings: 1, destination: 'Rajasthan', travelDate: '2027-04-10', status: 'Confirmed', sales: 'Sana', guestId: 'g1', confirmationId: 'c1' },
  { id: 'p:9000011111', name: 'Bhavna Shah', emails: [], phones: ['90000 11111', '80000 22222'], inquiries: 1, bookings: 0, destination: 'Goa', travelDate: '2027-01-10', status: 'Quoted', sales: 'Omar', guestId: 'g2', confirmationId: '' }
];
const FUTURE = [
  { _id: 'f1', name: 'Meera Joshi', phone: '+91 98765 11111', email: 'meera@mail.com', destination: 'Bali', expectedTravel: 'December 2026', budget: '2 lakh', source: 'Instagram', notes: 'Honeymoon', createdByName: 'Sana' }
];

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const show = (url = '/clients') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/clients" element={<><ClientsPage /><Where /></>} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  Object.values(h).forEach((f) => typeof f === 'function' && f.mockReset?.());
  h.rights = { create: true, update: true, delete: true };
  h.editable = true;
  h.current.mockResolvedValue({ success: true, data: CURRENT, sources: { guests: true, confirmations: true } });
  h.future.mockResolvedValue({ success: true, data: FUTURE });
  h.create.mockResolvedValue({ success: true, message: 'Client added.', data: { _id: 'f2' } });
  h.update.mockResolvedValue({ success: true, message: 'Client saved.', data: FUTURE[0] });
  h.updateCurrent.mockResolvedValue({ success: true, message: 'Contact details saved.' });
  h.del.mockResolvedValue({ success: true, message: 'Client removed.' });
  h.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: (...a) => h.copy(...a) }, configurable: true });
});
afterEach(cleanup);

describe('the clients page: current clients', () => {
  it('lists each person once, with every e-mail address and number, their trips and the way to their booking', async () => {
    show();
    const table = await screen.findByRole('table', { name: 'Current clients' });
    const aarav = within(table).getByRole('row', { name: /Aarav Mehta/ });
    expect(within(aarav).getByRole('link', { name: 'aarav@example.com' })).toHaveAttribute('href', 'mailto:aarav@example.com');
    expect(within(aarav).getByRole('link', { name: 'aarav.work@example.com' })).toBeInTheDocument();
    expect(aarav).toHaveTextContent('+91 98765 43210');
    expect(aarav).toHaveTextContent('2 inquiries');
    expect(aarav).toHaveTextContent('1 booking');
    expect(aarav).toHaveTextContent('Rajasthan');
    expect(within(aarav).getByRole('link', { name: /Booking/ })).toHaveAttribute('href', '/confirmations/c1');
    expect(within(aarav).getByRole('link', { name: 'WhatsApp +91 98765 43210' })).toHaveAttribute('href', 'https://wa.me/919876543210');
    const bhavna = within(table).getByRole('row', { name: /Bhavna Shah/ });
    expect(bhavna).toHaveTextContent('90000 11111');
    expect(bhavna).toHaveTextContent('80000 22222');
    expect(within(bhavna).getByRole('link', { name: /Guest list/ })).toHaveAttribute('href', '/guests');
    expect(screen.getByText('2 clients')).toBeInTheDocument();
  });

  it('searches by name, e-mail or number', async () => {
    show();
    await screen.findByRole('table', { name: 'Current clients' });
    await userEvent.type(screen.getByLabelText('Search the clients'), '8000022222');
    expect(screen.queryByText('Aarav Mehta')).toBeNull();
    expect(screen.getByText('Bhavna Shah')).toBeInTheDocument();
    expect(screen.getByText('1 client')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Search the clients'));
    await userEvent.type(screen.getByLabelText('Search the clients'), 'nobody here');
    expect(screen.getByText('No client matches the search.')).toBeInTheDocument();
  });

  it('copies the e-mail addresses shown, each once, to paste into a mail', async () => {
    show();
    await screen.findByRole('table', { name: 'Current clients' });
    await userEvent.click(screen.getByRole('button', { name: /Copy e-mails/ }));
    expect(h.copy).toHaveBeenCalledWith('aarav@example.com; aarav.work@example.com');
    expect(h.showToast).toHaveBeenCalledWith('Copied 2 e-mail addresses.', 'success');
  });

  it('says in words when the clients cannot load, and when a source is not allowed', async () => {
    h.current.mockResolvedValueOnce({ success: false, message: 'The clients are resting.' });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('The clients are resting.');
    h.current.mockResolvedValue({ success: true, data: CURRENT, sources: { guests: true, confirmations: false } });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/bookings are not included: you do not have access/)).toBeInTheDocument();
  });

  it('allows editing contact details for a current client and saves updates', async () => {
    show();
    const table = await screen.findByRole('table', { name: 'Current clients' });
    const editBtn = within(table).getByRole('button', { name: /Edit contact for Aarav Mehta/i });
    await userEvent.click(editBtn);

    expect(await screen.findByRole('heading', { name: 'Edit contact details' })).toBeInTheDocument();
    const phoneInput = screen.getByLabelText(/Phone \/ WhatsApp number/i);
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, '+91 99999 88888');

    const emailInput = screen.getByLabelText(/E-mail address/i);
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'aarav.new@example.com');

    await userEvent.click(screen.getByRole('button', { name: /Save contact/i }));
    await waitFor(() => expect(h.updateCurrent).toHaveBeenCalledWith({
      guestId: 'g1',
      confirmationId: 'c1',
      name: 'Aarav Mehta',
      phone: '+91 99999 88888',
      email: 'aarav.new@example.com'
    }));
    expect(h.showToast).toHaveBeenCalledWith('Contact details saved.', 'success');
  });
});

describe('the clients page: future clients', () => {
  const openFuture = async () => {
    show('/clients?tab=future');
    return screen.findByRole('table', { name: 'Future clients' });
  };

  it('is a second list on the same page, with what the client is after and where they came from', async () => {
    show();
    await screen.findByRole('table', { name: 'Current clients' });
    await userEvent.click(screen.getByRole('tab', { name: /Future clients/ }));
    const table = await screen.findByRole('table', { name: 'Future clients' });
    expect(screen.getByTestId('where')).toHaveTextContent('tab=future');
    const row = within(table).getByRole('row', { name: /Meera Joshi/ });
    for (const text of ['+91 98765 11111', 'meera@mail.com', 'Bali', 'December 2026', 'Budget 2 lakh', 'Instagram', 'Honeymoon', 'Added by Sana']) expect(row).toHaveTextContent(text);
    expect(screen.getByRole('tab', { name: /Current clients/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('adds a client: asks for the name first, then saves what was typed, trimmed, and shows the list again', async () => {
    await openFuture();
    await userEvent.click(screen.getByRole('button', { name: /Add future client/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add client' }));
    expect(await within(dialog).findByText('Please enter the name of the client.')).toBeInTheDocument();
    expect(h.create).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText('Name *'), '  Rohan Kapoor ');
    await userEvent.type(within(dialog).getByLabelText('Phone / WhatsApp number'), '+91 98111 22222');
    await userEvent.type(within(dialog).getByLabelText('Interested in (place)'), 'Maldives');
    await userEvent.selectOptions(within(dialog).getByLabelText('Where they came from'), 'Reference');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add client' }));
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create).toHaveBeenCalledWith({ name: 'Rohan Kapoor', phone: '+91 98111 22222', email: '', destination: 'Maldives', expectedTravel: '', budget: '', source: 'Reference', notes: '' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(h.future).toHaveBeenCalledTimes(2);
    expect(h.showToast).toHaveBeenCalledWith('Client added.', 'success');
  });

  it('keeps the form open and says why when the details are wrong or the server refuses', async () => {
    await openFuture();
    await userEvent.click(screen.getByRole('button', { name: /Add future client/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name *'), 'Rohan');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'nope');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add client' }));
    expect(await within(dialog).findByText(/e-mail address does not look right/)).toBeInTheDocument();
    expect(h.create).not.toHaveBeenCalled();
    await userEvent.clear(within(dialog).getByLabelText('E-mail'));
    h.create.mockResolvedValueOnce({ success: false, message: 'Access Denied: nope.' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add client' }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('Access Denied: nope.', 'error'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edits a client: the form starts with what was saved, and the change is sent for that client', async () => {
    await openFuture();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Meera Joshi' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Name *')).toHaveValue('Meera Joshi');
    expect(within(dialog).getByLabelText('Budget')).toHaveValue('2 lakh');
    await userEvent.clear(within(dialog).getByLabelText('Budget'));
    await userEvent.type(within(dialog).getByLabelText('Budget'), '3 lakh');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.update.mock.calls[0][0]).toBe('f1');
    expect(h.update.mock.calls[0][1]).toMatchObject({ name: 'Meera Joshi', budget: '3 lakh', destination: 'Bali' });
  });

  it('removes a client only after asking', async () => {
    await openFuture();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meera Joshi' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Meera Joshi will be removed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(h.del).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meera Joshi' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(h.del).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(h.future).toHaveBeenCalledTimes(2));
  });

  it('offers only what the person may do', async () => {
    h.rights = { create: false, update: true, delete: false };
    await openFuture();
    expect(screen.getByRole('button', { name: /Add future client/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Meera Joshi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Meera Joshi' })).toBeNull();
    cleanup();
    h.editable = false; // a client added by someone else
    await openFuture();
    expect(screen.queryByRole('button', { name: 'Edit Meera Joshi' })).toBeNull();
  });

  it('says what to do when there is none yet', async () => {
    h.future.mockResolvedValue({ success: true, data: [] });
    await openFuture();
    expect(screen.getByText(/No future client yet/)).toBeInTheDocument();
  });
});
