import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmBookingDialog, { optionTotal } from './ConfirmBookingDialog';
import CancelBookingDialog from './CancelBookingDialog';

afterEach(cleanup);

const quotation = (over = {}) => ({ _id: 'q1', quotationNo: '7H-QT-2026-004', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults', guestId: 'g1', options: [], ...over });
const withOptions = () => quotation({
  options: [
    { name: 'Option A', pricePerPerson: 30000, totalPrice: 60000, hotels: [{ hotelName: 'Hotel A' }, { hotelName: 'Hotel A2' }] },
    { name: 'Option B', pricePerPerson: 45000, totalPrice: 0, hotels: [{ hotelName: 'Hotel B' }] }
  ]
});

describe('ConfirmBookingDialog', () => {
  it('says what will happen and confirms a quotation without options straight away', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmBookingDialog quotation={quotation()} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByRole('dialog', { name: 'Confirm this booking?' })).toBeInTheDocument();
    expect(screen.getByText(/7H-QT-2026-004 · Aarav Mehta · RAJASTHAN/)).toBeInTheDocument();
    expect(screen.getByText(/create a booking confirmation/)).toBeInTheDocument();
    expect(screen.getByText(/lock the quotation/)).toBeInTheDocument();
    expect(screen.getByText('mark the guest as Confirmed')).toBeInTheDocument();
    expect(screen.queryByText(/Which hotel option/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Confirm booking/ }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('does not talk about the guest when the quotation has none', () => {
    render(<ConfirmBookingDialog quotation={quotation({ guestId: null })} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText(/mark the guest/)).toBeNull();
  });

  it('needs the accepted option when there are several, and shows what each costs', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmBookingDialog quotation={withOptions()} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: /Confirm booking/ });
    expect(confirm).toBeDisabled();
    expect(screen.getByText('Choose the option the client accepted to continue.')).toBeInTheDocument();
    expect(screen.getByText(/Rs 30,000 per person · Rs 60,000 in all/)).toBeInTheDocument();
    expect(screen.getByText(/Rs 45,000 per person · Rs 90,000 in all/)).toBeInTheDocument(); // no stored total: price x 2 guests
    expect(screen.getByText('Hotel A, Hotel A2')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Option B/));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(1);
  });

  it('starts with no option chosen each time it opens', async () => {
    const { rerender } = render(<ConfirmBookingDialog quotation={withOptions()} isOpen onClose={() => {}} onConfirm={() => {}} />);
    await userEvent.click(screen.getByLabelText(/Option A/));
    expect(screen.getByRole('button', { name: /Confirm booking/ })).toBeEnabled();
    rerender(<ConfirmBookingDialog quotation={withOptions()} isOpen={false} onClose={() => {}} onConfirm={() => {}} />);
    rerender(<ConfirmBookingDialog quotation={withOptions()} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: /Confirm booking/ })).toBeDisabled();
  });

  it('cannot be pressed twice while it is working', () => {
    render(<ConfirmBookingDialog quotation={quotation()} isOpen onClose={() => {}} onConfirm={() => {}} busy />);
    expect(screen.getByRole('button', { name: /Confirming/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
  });

  it('prices an option with no stored total as the price per person times the guests', () => {
    expect(optionTotal({ pricePerPerson: 1000.5, totalPrice: 0 }, '3 Adults + 1 Child')).toBe(3001.5);
    expect(optionTotal({ pricePerPerson: 1000, totalPrice: 5000 }, '3 Adults')).toBe(5000);
  });
});

describe('CancelBookingDialog', () => {
  const booking = (over = {}) => ({ _id: 'c1', confirmationNo: '7H-CF-2026-001', quotationNo: '7H-QT-2026-004', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', payment: { received: 0 }, previousGuestStatus: 'Quoted', ...over });

  it('asks for a reason in plain words and does nothing without one', async () => {
    const onConfirm = vi.fn();
    render(<CancelBookingDialog confirmation={booking()} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a reason for cancelling.');
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Why is it being cancelled/), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('passes on the trimmed reason', async () => {
    const onConfirm = vi.fn();
    render(<CancelBookingDialog confirmation={booking()} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    await userEvent.type(screen.getByLabelText(/Why is it being cancelled/), '  Client postponed the trip ');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    expect(onConfirm).toHaveBeenCalledWith('Client postponed the trip');
  });

  it('says what will happen, and warns when money has been received', () => {
    const { rerender } = render(<CancelBookingDialog confirmation={booking()} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/unlock quotation 7H-QT-2026-004/)).toBeInTheDocument();
    expect(screen.getByText(/put the guest back to “Quoted”/)).toBeInTheDocument();
    expect(screen.queryByText(/has been received/)).toBeNull();
    rerender(<CancelBookingDialog confirmation={booking({ payment: { received: 40000 }, previousGuestStatus: '' })} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/Rs 40,000 has been received for this booking\. Cancelling does not change or refund payments/)).toBeInTheDocument();
    expect(screen.queryByText(/put the guest back/)).toBeNull();
  });

  it('forgets the reason when it is opened again', async () => {
    const { rerender } = render(<CancelBookingDialog confirmation={booking()} isOpen onClose={() => {}} onConfirm={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Why is it being cancelled/), 'old reason');
    rerender(<CancelBookingDialog confirmation={booking()} isOpen={false} onClose={() => {}} onConfirm={() => {}} />);
    rerender(<CancelBookingDialog confirmation={booking()} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByLabelText(/Why is it being cancelled/)).toHaveValue('');
  });
});
