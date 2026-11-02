import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), edit: true }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: () => true, canEditRecord: () => h.edit }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => h.navigate }));
vi.mock('../services/confirmationService', () => ({ default: { list: vi.fn(), get: vi.fn() } }));
// The real preview has its own tests; here it only says it is open.
vi.mock('../components/confirmation/ConfirmationPreview', () => ({ default: ({ confirmation, isOpen }) => (isOpen ? <div role="dialog" aria-label="preview">Preview of {confirmation.confirmationNo} with {Object.keys(confirmation.quote || {}).length} quote fields</div> : null) }));

import confirmationService from '../services/confirmationService';
import ConfirmationListPage from './ConfirmationListPage';

const row = (n, over = {}) => ({
  _id: `id${n}`, confirmationNo: `7H-CF-2026-00${n}`, quotationNo: `7H-QT-2026-00${n}`, clientName: `Client ${n}`, destination: 'RAJASTHAN', duration: '5 Nights / 6 Days', paxDetails: '2 Adults',
  travelDate: '2027-04-10T00:00:00.000Z', status: 'Confirmed', travellers: [{ name: 'A' }], optionName: '', payment: { totalAmount: 120000, received: 40000 }, balance: 80000, ...over
});
const page = (data, over = {}) => ({ success: true, data, total: data.length, page: 1, limit: 20, pages: 1, ...over });
const show = () => render(<MemoryRouter><ConfirmationListPage /></MemoryRouter>);

beforeEach(() => {
  confirmationService.list.mockReset();
  confirmationService.get.mockReset();
  h.showToast.mockReset();
  h.navigate.mockReset();
  h.edit = true;
});
afterEach(cleanup);

describe('ConfirmationListPage', () => {
  it('lists the bookings with what is paid and what is still to pay', async () => {
    confirmationService.list.mockResolvedValue(page([row(1), row(2, { balance: 0, payment: { totalAmount: 50000, received: 50000 } }), row(3, { status: 'Cancelled', payment: { totalAmount: 10000, received: 2000 }, balance: 8000 })]));
    show();
    expect(await screen.findByText('7H-CF-2026-001')).toBeInTheDocument();
    expect(screen.getByText('3 bookings')).toBeInTheDocument();
    expect(screen.getByText('From 7H-QT-2026-001')).toBeInTheDocument();
    expect(screen.getByText('₹80,000 to pay')).toBeInTheDocument();
    expect(screen.getByText('Fully paid')).toBeInTheDocument();
    expect(screen.getByText('₹2,000 received')).toBeInTheDocument(); // a cancelled booking does not claim a balance
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
    expect(screen.getByText('Cancelled', { selector: '.cf-badge' })).toBeInTheDocument();
    expect(confirmationService.list).toHaveBeenCalledWith({ status: 'all', page: 1, limit: 20 });
  });

  it('searches once typing pauses, and filters by status', async () => {
    confirmationService.list.mockResolvedValue(page([row(1)]));
    show();
    await screen.findByText('7H-CF-2026-001');
    await userEvent.type(screen.getByLabelText('Search confirmations'), 'zubin');
    await waitFor(() => expect(confirmationService.list).toHaveBeenLastCalledWith({ search: 'zubin', status: 'all', page: 1, limit: 20 }));
    await userEvent.click(screen.getByRole('tab', { name: 'Cancelled' }));
    await waitFor(() => expect(confirmationService.list).toHaveBeenLastCalledWith({ search: 'zubin', status: 'Cancelled', page: 1, limit: 20 }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(confirmationService.list).toHaveBeenLastCalledWith({ status: 'all', page: 1, limit: 20 }));
  });

  it('says what to do when there are no bookings, and when nothing matches', async () => {
    confirmationService.list.mockResolvedValue(page([]));
    show();
    expect(await screen.findByText('No confirmed bookings yet')).toBeInTheDocument();
    expect(screen.getByText(/press the tick on its row/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Confirmed' }));
    expect(await screen.findByText('No bookings match')).toBeInTheDocument();
  });

  it('shows a problem in plain words with a way to try again', async () => {
    confirmationService.list.mockResolvedValueOnce({ success: false, message: 'Access Denied: You do not have permissions for the confirmations module.' });
    confirmationService.list.mockResolvedValueOnce(page([row(1)]));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Access Denied');
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('7H-CF-2026-001')).toBeInTheDocument();
  });

  it('opens a booking, and previews the whole record (the list only carries what it shows)', async () => {
    confirmationService.list.mockResolvedValue(page([row(1)]));
    confirmationService.get.mockResolvedValue({ success: true, data: { ...row(1), quote: { destination: 'RAJASTHAN', itinerary: [] } } });
    show();
    await screen.findByText('7H-CF-2026-001');
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(h.navigate).toHaveBeenCalledWith('/confirmations/id1');
    await userEvent.click(screen.getByRole('button', { name: 'Preview 7H-CF-2026-001' }));
    expect(await screen.findByRole('dialog', { name: 'preview' })).toHaveTextContent('Preview of 7H-CF-2026-001 with 2 quote fields');
    expect(confirmationService.get).toHaveBeenCalledWith('id1');
  });

  it('tells the user when a preview cannot be opened', async () => {
    confirmationService.list.mockResolvedValue(page([row(1)]));
    confirmationService.get.mockResolvedValue({ success: false, message: 'Confirmation not found.' });
    show();
    await screen.findByText('7H-CF-2026-001');
    await userEvent.click(screen.getByRole('button', { name: 'Preview 7H-CF-2026-001' }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('Confirmation not found.', 'error'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers View, not Open, to someone who cannot change the booking', async () => {
    h.edit = false;
    confirmationService.list.mockResolvedValue(page([row(1), row(2, { status: 'Cancelled' })]));
    show();
    await screen.findByText('7H-CF-2026-001');
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2);
  });

  it('pages through long lists', async () => {
    confirmationService.list.mockResolvedValue(page([row(1)], { total: 45, pages: 3 }));
    show();
    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(confirmationService.list).toHaveBeenLastCalledWith({ status: 'all', page: 2, limit: 20 }));
    const row1 = within(screen.getByRole('table')).getByText('7H-CF-2026-001');
    expect(row1).toBeInTheDocument();
  });
});
