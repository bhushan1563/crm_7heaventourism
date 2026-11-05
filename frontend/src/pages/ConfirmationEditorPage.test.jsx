import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), edit: true, download: true, update: true }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { firstName: 'Sana', lastName: 'Tester', senderNumber: '+919876543210' }, can: (m, a) => (a === 'canDownload' ? h.download : a === 'canUpdate' ? h.update : true), canEditRecord: () => h.edit }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../services/confirmationService', () => ({ default: { get: vi.fn(), update: vi.fn(), cancel: vi.fn() } }));
vi.mock('../components/LazyRichTextEditor', () => ({ default: ({ value, onChange, ariaLabel, disabled }) => <textarea aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /> }));
vi.mock('../components/confirmation/ConfirmationPreview', () => ({ default: ({ isOpen, form }) => (isOpen ? <div role="dialog" aria-label="preview">Preview with {form.travellers.length} travellers</div> : null) }));

vi.mock('../components/confirmation/ShareConfirmationDialog', () => ({
  default: ({ confirmation, canEdit, senderName, senderNumber, onContactSaved, onClose }) => (
    <div role="dialog" aria-label="share">
      Sending {confirmation.confirmationNo} edit:{String(canEdit)} from:{senderName} {senderNumber}
      <button onClick={() => onContactSaved({ clientPhone: '+91 98765 43210' }, { ...confirmation, clientPhone: '+91 98765 43210', updatedAt: '2026-11-04T10:00:00.000Z' })}>Pretend it was kept</button>
      <button onClick={onClose}>Close share</button>
    </div>
  )
}));

import confirmationService from '../services/confirmationService';
import ConfirmationEditorPage from './ConfirmationEditorPage';

const stored = (over = {}) => ({
  _id: 'c1', confirmationNo: '7H-CF-2026-001', quotationId: 'q1', quotationNo: '7H-QT-2026-004', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults', optionName: '',
  status: 'Confirmed', confirmedAt: '2026-11-01T10:00:00.000Z', createdByName: 'Sana Sales', travelDate: '2027-04-10T00:00:00.000Z', travellers: [{ name: 'Aarav Mehta', age: 41, passportNo: 'Z1', notes: '' }],
  payment: { totalAmount: 120000, received: 40000, balanceDueDate: null, note: '' }, notes: '', customFields: [], previousGuestStatus: 'Quoted', updatedAt: '2026-11-01T10:00:00.000Z', quote: { destination: 'RAJASTHAN' }, ...over
});
const show = () => render(<MemoryRouter initialEntries={['/confirmations/c1']}><Routes><Route path="/confirmations" element={<div>the list</div>} /><Route path="/confirmations/:id" element={<ConfirmationEditorPage />} /></Routes></MemoryRouter>);

beforeEach(() => {
  Object.values(confirmationService).forEach((fn) => fn.mockReset());
  h.showToast.mockReset();
  h.edit = true;
  h.download = true;
  h.update = true;
});
afterEach(cleanup);

describe('ConfirmationEditorPage', () => {
  it('shows the booking: its number, status, summary and the saved details', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    expect(await screen.findByRole('heading', { name: '7H-CF-2026-001' })).toBeInTheDocument();
    expect(screen.getByText('Confirmed', { selector: '.cf-badge' })).toBeInTheDocument();
    const summary = document.querySelector('.cf-summary');
    expect(summary).toHaveTextContent('Aarav Mehta');
    expect(summary).toHaveTextContent('₹1,20,000');
    expect(summary).toHaveTextContent('₹80,000');
    expect(screen.getByRole('link', { name: '7H-QT-2026-004' })).toHaveAttribute('href', '/quotations/q1/edit');
    expect(screen.getByLabelText('Name')).toHaveValue('Aarav Mehta');
    expect(screen.getByLabelText('Travel date')).toHaveValue('2027-04-10');
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save changes/ })).toBeDisabled();
  });

  it('opens an old booking with a bare duration, no option, no hotels and no travellers, without blanks or crashes', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored({ duration: '7', optionName: '', travellers: [], travelDate: null, hotelBookings: undefined, quote: { duration: '7' } }) });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    const summary = document.querySelector('.cf-summary');
    expect(summary).toHaveTextContent('7 Nights');
    expect(summary).toHaveTextContent('Not set');
    expect(document.body).not.toHaveTextContent(/undefined|NaN|Invalid Date/);
  });

  it('shows the hotels of the sold option with their address, city and dates', async () => {
    const stay = { hotelName: 'Hotel One', city: 'Udaipur', address: 'Lake Road', checkInDate: '2027-04-10', checkOutDate: 'not-a-date' };
    confirmationService.get.mockResolvedValue({ success: true, data: stored({ quote: { packageDetails: { hotels: [stay] }, pricing: { grandTotal: 5000 } } }) });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    const snap = document.querySelector('.cf-quote-snapshot');
    expect(snap).toHaveTextContent('Lake Road, Udaipur');
    expect(snap).toHaveTextContent('In: 10-04-2027');
    expect(snap).not.toHaveTextContent('Invalid Date');
  });

  it('saves only what changed in the booking, with the version it was loaded at, and shows the new balance', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    confirmationService.update.mockResolvedValue({ success: true, message: 'Booking details saved.', data: stored({ payment: { totalAmount: 120000, received: 90000, balanceDueDate: '2027-03-01T00:00:00.000Z', note: '' }, updatedAt: '2026-11-01T11:00:00.000Z' }) });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    const received = screen.getByLabelText('Received so far (Rs)');
    await userEvent.clear(received);
    await userEvent.type(received, '90000');
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Balance due by'), '2027-03-01');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(confirmationService.update).toHaveBeenCalled());
    const [id, payload] = confirmationService.update.mock.calls[0];
    expect(id).toBe('c1');
    expect(payload.payment).toEqual({ totalAmount: 120000, received: 90000, balanceDueDate: '2027-03-01', supplier: '', note: '' });
    expect(payload.updatedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(payload.travellers).toEqual([{ name: 'Aarav Mehta', age: 41, passportNo: 'Z1', notes: '' }]);
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('quote');
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
    expect(h.showToast).toHaveBeenCalledWith('Booking details saved.', 'success');
  });

  it('does not save a problem: it names it next to the field and moves the cursor there', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    const received = screen.getByLabelText('Received so far (Rs)');
    await userEvent.clear(received);
    await userEvent.type(received, '999999');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(confirmationService.update).not.toHaveBeenCalled();
    expect(await screen.findByText('The amount received (Rs 9,99,999) cannot be more than the total amount (Rs 1,20,000).')).toBeInTheDocument();
    expect(h.showToast).toHaveBeenCalledWith('Please fix the highlighted field before saving.', 'warning');
    expect(received).toHaveFocus();
  });

  it('keeps what was typed when the server refuses, and offers the latest version after a clash', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    confirmationService.update.mockResolvedValue({ success: false, message: 'This confirmation was changed by Omar Ops while you were editing it. Please reload to see their changes before saving.' });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    await userEvent.type(screen.getByLabelText('Payment note'), 'Cheque');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by Omar Ops while you were editing it');
    expect(screen.getByLabelText('Payment note')).toHaveValue('Cheque');
    confirmationService.get.mockResolvedValue({ success: true, data: stored({ payment: { totalAmount: 120000, received: 40000, balanceDueDate: null, note: 'Omar was here' } }) });
    await userEvent.click(screen.getByRole('button', { name: /Load the latest version/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Load the latest version' }));
    await waitFor(() => expect(screen.getByLabelText('Payment note')).toHaveValue('Omar was here'));
  });

  it('cancels the booking only with a reason, then shows it as cancelled and read only', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    confirmationService.cancel.mockResolvedValue({ success: true, message: 'Booking 7H-CF-2026-001 cancelled. The quotation can be edited again.', data: stored({ status: 'Cancelled', cancelReason: 'Client postponed', cancelledByName: 'Sana Sales', cancelledAt: '2026-11-02T09:00:00.000Z' }) });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    await userEvent.click(screen.getByRole('button', { name: /Cancel booking/ }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this booking?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    expect(confirmationService.cancel).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/Why is it being cancelled/), 'Client postponed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    await waitFor(() => expect(confirmationService.cancel).toHaveBeenCalledWith('c1', 'Client postponed'));
    expect(await screen.findByText(/Cancelled on .* by Sana Sales: Client postponed\. This record is kept for reference/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Cancel booking/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull();
    expect(screen.getByLabelText('Name')).toBeDisabled();
  });

  it('shows a cancelled booking read only from the start', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored({ status: 'Cancelled', cancelReason: 'No longer travelling' }) });
    show();
    expect(await screen.findByText(/No longer travelling/)).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a traveller/ })).toBeNull();
  });

  it('is read only, with a plain explanation, for someone who is not assigned to the booking', async () => {
    h.edit = false;
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    expect(await screen.findByText(/can only be changed by the people assigned to them/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cancel booking/ })).toBeNull();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Preview & PDF/ })).toBeInTheDocument();
  });

  it('previews with what is typed, saved or not', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    await userEvent.click(screen.getByRole('button', { name: /Add a traveller/ }));
    await userEvent.click(screen.getByRole('button', { name: /Preview & PDF/ }));
    expect(await screen.findByRole('dialog', { name: 'preview' })).toHaveTextContent('Preview with 2 travellers');
  });

  it('leaves at once when nothing changed, but warns first when there are unsaved changes', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    const { unmount } = show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    await userEvent.click(screen.getByRole('button', { name: /^Confirmations$/ }));
    expect(screen.getByText('the list')).toBeInTheDocument();
    unmount();

    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    await userEvent.type(screen.getByLabelText('Payment note'), 'Cheque');
    await userEvent.click(screen.getByRole('button', { name: /^Confirmations$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Leave without saving?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('the list')).toBeNull();
    expect(screen.getByLabelText('Payment note')).toHaveValue('Cheque');
    await userEvent.click(screen.getByRole('button', { name: /^Confirmations$/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByText('the list')).toBeInTheDocument();
  });

  it('explains when the booking cannot be opened, and can try again', async () => {
    confirmationService.get.mockResolvedValueOnce({ success: false, message: 'Confirmation not found.' });
    confirmationService.get.mockResolvedValueOnce({ success: true, data: stored() });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirmation not found.');
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('heading', { name: '7H-CF-2026-001' })).toBeInTheDocument();
  });
});

describe('ConfirmationEditorPage: sending the booking to the client', () => {
  it('has a Send to client button, which opens the share window with the booking and the sender', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Send to client/ }));
    expect(screen.getByRole('dialog', { name: 'share' })).toHaveTextContent('Sending 7H-CF-2026-001 edit:true from:Sana Tester +919876543210');
  });

  it('waits for unsaved changes to be saved, so the client gets what is on the page', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    const send = await screen.findByRole('button', { name: /Send to client/ });
    expect(send).toBeEnabled();
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Someone Else');
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute('title', expect.stringContaining('Save your changes first'));
  });

  it('is not offered on a cancelled booking, nor without the Download right', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored({ status: 'Cancelled', cancelReason: 'Plans changed', cancelledAt: '2026-11-02T10:00:00.000Z' }) });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    expect(screen.queryByRole('button', { name: /Send to client/ })).toBeNull();
    cleanup();
    h.download = false;
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    await screen.findByRole('heading', { name: '7H-CF-2026-001' });
    expect(screen.queryByRole('button', { name: /Send to client/ })).toBeNull();
  });

  it('lets the window keep a number only for someone who may change the booking', async () => {
    h.edit = false;
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Send to client/ }));
    expect(screen.getByRole('dialog', { name: 'share' })).toHaveTextContent('edit:false');
  });

  it('shows the saved version of the booking after a number was kept, without a false "unsaved changes"', async () => {
    confirmationService.get.mockResolvedValue({ success: true, data: stored() });
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Send to client/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Pretend it was kept' }));
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send to client/ })).toBeEnabled();
  });
});

