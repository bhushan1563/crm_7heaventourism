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
    expect(onConfirm).toHaveBeenCalledWith(undefined, undefined);
  });

  it('does not talk about the guest when the quotation has none', () => {
    render(<ConfirmBookingDialog quotation={quotation({ guestId: null })} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText(/mark the guest/)).toBeNull();
  });

  it('shows the Grand Total of an option priced by its rate tables, not a price per person', () => {
    const stay = (name, rate) => ({ hotelName: name, nights: '3 Nights', noOfRooms: '2 Rooms', rates: [{ kind: 'room', label: '2 Adults', rate, nights: null, rooms: null }] });
    const q = quotation({ quotationType: 'Only Hotel', options: [{ name: '3 Star', pricePerPerson: 1, totalPrice: 1, hotels: [stay('Hotel A', 5000), stay('Hotel B', 4000)] }, { name: '4 Star', pricePerPerson: 0, totalPrice: 0, hotels: [{ hotelName: 'Hotel Old' }] }] });
    render(<ConfirmBookingDialog quotation={q} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Grand Total Rs 54,000')).toBeInTheDocument(); // counted from the tables (30,000 + 24,000), whatever total was stored
    expect(screen.queryByText(/Rs 1 per person/)).toBeNull();
    expect(screen.getByText(/Rs 0 per person/)).toBeInTheDocument(); // an option with no tables is shown as before
  });

  it('needs the accepted option when there are several, and shows what each costs', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmBookingDialog quotation={withOptions()} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: /Confirm booking/ });
    expect(confirm).toBeDisabled();
    expect(screen.getByText('Choose what the client accepted to continue.')).toBeInTheDocument();
    expect(screen.getByText(/Rs 30,000 per person · Rs 60,000 in all/)).toBeInTheDocument();
    expect(screen.getByText(/Rs 45,000 per person · Rs 90,000 in all/)).toBeInTheDocument(); // no stored total: price x 2 guests
    expect(screen.getByText('Hotel A, Hotel A2')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Option B/));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(1, undefined);
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

describe('ConfirmBookingDialog with pricing options', () => {
  const row = (over = {}) => ({ label: 'Adult', package: 30000, airfare: 12000, visa: 6000, tcs: 1500, pax: 2, ...over });
  const hotel = (priceTables, over = {}) => quotation({ quotationType: 'Only Hotel', priceTables, ...over });
  const two = () => [{ name: 'Option 1', rows: [row()] }, { name: 'Option 2', rows: [row({ package: 36000 })] }];

  it('asks which pricing option the client accepted, with each Grand Total, and sends its number', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmBookingDialog quotation={hotel(two())} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByText('Which pricing option did the client accept?')).toBeInTheDocument();
    expect(screen.getByText('Grand Total Rs 99,000')).toBeInTheDocument();
    expect(screen.getByText('Grand Total Rs 1,11,000')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /Confirm booking/ });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Option 2/));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(undefined, 1);
  });

  it('does not offer an option that was left empty, and needs no choice when only one is filled in', async () => {
    const onConfirm = vi.fn();
    const q = hotel([{ name: 'Option 1', rows: [row()] }, { name: 'Option 2', rows: [row({ package: 0, airfare: 0, visa: 0, tcs: 0, pax: 0 })] }]);
    render(<ConfirmBookingDialog quotation={q} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    expect(screen.queryByText('Which pricing option did the client accept?')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Confirm booking/ }));
    expect(onConfirm).toHaveBeenCalledWith(undefined, undefined);
  });

  it('needs both choices when the quotation also offers hotel options', async () => {
    const onConfirm = vi.fn();
    const q = hotel(two(), { options: [{ name: 'Hotel A', pricePerPerson: 1, totalPrice: 2, hotels: [] }, { name: 'Hotel B', pricePerPerson: 3, totalPrice: 6, hotels: [] }] });
    render(<ConfirmBookingDialog quotation={q} isOpen onClose={() => {}} onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: /Confirm booking/ });
    await userEvent.click(screen.getByLabelText(/Hotel B/));
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Option 1/));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(1, 0);
  });

  it('ignores pricing options laid out for another kind of quotation: a package with only a sheet is confirmed the usual way', () => {
    render(<ConfirmBookingDialog quotation={hotel(two(), { quotationType: 'Package' })} isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText('Which pricing option did the client accept?')).toBeNull();
  });

  describe('when the pricing tables carry the prices (the hotel options have none of their own)', () => {
    const stars = () => [{ name: '3 Star', hotels: [{ hotelName: 'Hotel A' }, { hotelName: 'Hotel A2' }] }, { name: '4 Star', hotels: [{ hotelName: 'Hotel B' }] }];

    it('asks one question: each hotel option shows the Grand Total of the pricing option in the same place, and both numbers are sent', async () => {
      const onConfirm = vi.fn();
      render(<ConfirmBookingDialog quotation={hotel(two(), { options: stars() })} isOpen onClose={() => {}} onConfirm={onConfirm} />);
      expect(screen.getByText('Which hotel option did the client accept?')).toBeInTheDocument();
      expect(screen.queryByText('Which pricing option did the client accept?')).toBeNull();
      expect(screen.getByText('Grand Total Rs 99,000')).toBeInTheDocument();
      expect(screen.getByText('Grand Total Rs 1,11,000')).toBeInTheDocument();
      expect(screen.getByText('Hotel A, Hotel A2')).toBeInTheDocument();
      const confirm = screen.getByRole('button', { name: /Confirm booking/ });
      expect(confirm).toBeDisabled();
      await userEvent.click(screen.getByLabelText(/4 Star/));
      expect(confirm).toBeEnabled();
      await userEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledWith(1, 1);
    });

    it('works the same for a package priced per room per night, with the nights following the trip', async () => {
      const onConfirm = vi.fn();
      const rooms = [
        { name: 'Option 1', layout: 'rooms', rows: [{ label: 'For 2 Adults', rate: 5000, nights: null, rooms: null }] },
        { name: 'Option 2', layout: 'rooms', rows: [{ label: 'For 2 Adults', rate: 8000, nights: null, rooms: 2 }] }
      ];
      render(<ConfirmBookingDialog quotation={quotation({ quotationType: 'Package', duration: '4 Nights / 5 Days', priceTables: rooms, options: stars() })} isOpen onClose={() => {}} onConfirm={onConfirm} />);
      expect(screen.getByText('Grand Total Rs 20,000')).toBeInTheDocument(); // 5,000 x 4 nights x 1 room
      expect(screen.getByText('Grand Total Rs 64,000')).toBeInTheDocument(); // 8,000 x 4 nights x 2 rooms
      await userEvent.click(screen.getByLabelText(/3 Star/));
      await userEvent.click(screen.getByRole('button', { name: /Confirm booking/ }));
      expect(onConfirm).toHaveBeenCalledWith(0, 0);
    });

    it('asks the second question only when the options do not line up with the pricing options', async () => {
      const onConfirm = vi.fn();
      const three = [...stars(), { name: 'Deluxe', hotels: [{ hotelName: 'Hotel C' }] }]; // three hotel options, two pricing options
      render(<ConfirmBookingDialog quotation={hotel(two(), { options: three })} isOpen onClose={() => {}} onConfirm={onConfirm} />);
      expect(screen.getByText('Which pricing option did the client accept?')).toBeInTheDocument();
      expect(screen.getAllByText('Grand Total Rs 99,000')).toHaveLength(1); // only in the pricing question, not on the hotel options
      await userEvent.click(screen.getByLabelText(/Deluxe/));
      await userEvent.click(screen.getByLabelText(/Option 2/));
      await userEvent.click(screen.getByRole('button', { name: /Confirm booking/ }));
      expect(onConfirm).toHaveBeenCalledWith(2, 1);
    });
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
