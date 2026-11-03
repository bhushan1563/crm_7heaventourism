import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingEditor from './BookingEditor';
import { bookingErrors, formFromConfirmation } from '../../utils/confirmation';

// The real rich editor has its own tests; here it is a simple stand-in.
vi.mock('../LazyRichTextEditor', () => ({ default: ({ value, onChange, ariaLabel, disabled }) => <textarea aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /> }));

afterEach(cleanup);

const Harness = ({ initial, onState, readOnly = false, showErrors = false, hotels = [] }) => {
  const [form, setForm] = useState(initial);
  return (
    <BookingEditor
      form={form}
      errors={showErrors ? bookingErrors(form) : {}}
      readOnly={readOnly}
      hotels={hotels}
      onChange={(patch) => {
        setForm((f) => {
          const next = { ...f, ...patch };
          onState?.(next);
          return next;
        });
      }}
    />
  );
};
const start = (over = {}) => ({ ...formFromConfirmation({ payment: { totalAmount: 120000, received: 0 } }), ...over });

describe('BookingEditor', () => {
  it('starts with helpful empty states', () => {
    render(<Harness initial={start()} />);
    expect(screen.getByText(/No traveller added yet/)).toBeInTheDocument();
    expect(screen.getByText('No additional detail yet.')).toBeInTheDocument();
    expect(screen.getByText('Balance to pay').parentElement).toHaveTextContent('Rs 1,20,000');
  });

  it('adds travellers, keeps what is typed and removes a line', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /Add a traveller/ }));
    await userEvent.click(screen.getByRole('button', { name: /Add a traveller/ }));
    const first = screen.getByRole('group', { name: 'Traveller 1' });
    await userEvent.type(within(first).getByLabelText('Name'), 'Aarav Mehta');
    await userEvent.type(within(first).getByLabelText('Age'), '41');
    await userEvent.type(within(first).getByLabelText('Passport number'), 'Z1234567');
    await userEvent.type(screen.getByLabelText('Note for traveller 1'), 'Vegetarian');
    await userEvent.type(within(screen.getByRole('group', { name: 'Traveller 2' })).getByLabelText('Name'), 'Anaya');
    expect(seen.mock.lastCall[0].travellers).toEqual([{ name: 'Aarav Mehta', age: '41', passportNo: 'Z1234567', notes: 'Vegetarian' }, { name: 'Anaya', age: '', passportNo: '', notes: '' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove traveller 1' }));
    expect(screen.getAllByRole('group', { name: /^Traveller \d$/ })).toHaveLength(1);
    expect(screen.getByLabelText('Name')).toHaveValue('Anaya');
    expect(screen.getByText('Travellers').parentElement).toHaveTextContent('(1)');
  });

  it('works out the balance as the amounts are typed', async () => {
    render(<Harness initial={start()} />);
    const received = screen.getByLabelText('Received so far (Rs)');
    await userEvent.clear(received);
    await userEvent.type(received, '45000');
    expect(screen.getByText('Balance to pay').parentElement).toHaveTextContent('Rs 75,000');
    await userEvent.clear(received);
    await userEvent.type(received, '120000');
    expect(screen.getByText('Fully paid').parentElement).toHaveTextContent('Rs 0');
    await userEvent.clear(screen.getByLabelText('Total amount (Rs)'));
    await userEvent.type(screen.getByLabelText('Total amount (Rs)'), '100000');
    expect(screen.getByText('Received is more than the total by').parentElement).toHaveTextContent('Rs 20,000'); // 1,20,000 received against 1,00,000
    expect(screen.queryByText('Fully paid')).toBeNull();
  });

  it('keeps the dates, the payment note and the notes', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} onState={seen} />);
    await userEvent.type(screen.getByLabelText('Travel date'), '2027-04-10');
    await userEvent.type(screen.getByLabelText('Balance due by'), '2027-03-01');
    await userEvent.type(screen.getByLabelText('Payment note'), 'Advance by cheque');
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Airport pick-up at 10:30');
    const last = seen.mock.lastCall[0];
    expect([last.travelDate, last.payment.balanceDueDate, last.payment.note, last.notes]).toEqual(['2027-04-10', '2027-03-01', 'Advance by cheque', 'Airport pick-up at 10:30']);
  });

  it('adds and removes additional details (label and value)', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /Add a detail/ }));
    const row = screen.getByRole('group', { name: 'Additional detail 1' });
    await userEvent.type(within(row).getByLabelText('Label'), 'Hotel voucher no.');
    await userEvent.type(within(row).getByLabelText('Value'), 'HV-7781');
    expect(seen.mock.lastCall[0].customFields).toEqual([{ label: 'Hotel voucher no.', value: 'HV-7781' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove additional detail 1' }));
    expect(screen.getByText('No additional detail yet.')).toBeInTheDocument();
  });

  it('shows each problem next to its field, in plain words', () => {
    const bad = start({
      travellers: [{ name: '', age: '200', passportNo: '', notes: '' }],
      payment: { totalAmount: 1000, received: 1500, balanceDueDate: '', note: '' },
      customFields: [{ label: '', value: 'x' }]
    });
    render(<Harness initial={bad} showErrors />);
    expect(screen.getByRole('group', { name: 'Traveller 1' })).toHaveTextContent('Please enter the name of traveller 1, or remove that line.');
    expect(screen.getByRole('group', { name: 'Traveller 1' })).toHaveTextContent('The age of traveller 1 must be a whole number from 0 to 120.');
    expect(screen.getByLabelText('Received so far (Rs)')).toHaveAccessibleDescription('The amount received (Rs 1,500) cannot be more than the total amount (Rs 1,000).');
    expect(screen.getByRole('group', { name: 'Additional detail 1' })).toHaveTextContent('Please enter a label for additional detail 1, or remove that line.');
  });

  it('is only readable when read only: nothing to type into, no add or remove buttons', () => {
    render(<Harness initial={start({ travellers: [{ name: 'Aarav', age: '', passportNo: '', notes: '' }], customFields: [{ label: 'Driver', value: 'Raju' }] })} readOnly />);
    expect(screen.queryByRole('button', { name: /Add a/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
    for (const field of screen.getAllByRole('textbox')) expect(field).toBeDisabled();
    expect(screen.getByLabelText('Total amount (Rs)')).toBeDisabled();
  });
});

describe('BookingEditor: what each hotel gave', () => {
  const stays = [{ hotelName: 'Hotel Sunrise', city: 'Udaipur', contactNumber: '+91 294 111 2222', checkInTime: '14:00', checkOutTime: '11:00' }, { hotelName: 'Hotel Moonlight', city: 'Jaipur' }];
  const withHotels = (over = {}) => formFromConfirmation({ payment: { totalAmount: 120000, received: 0 }, quote: { packageDetails: { hotels: stays } }, ...over });

  it('has a section for the hotels with the four boxes for each, started from the hotel list', () => {
    render(<Harness initial={withHotels()} hotels={stays} />);
    expect(screen.getByRole('heading', { name: /Hotels/ })).toBeInTheDocument();
    const first = screen.getByRole('group', { name: 'Hotel 1: Hotel Sunrise' });
    expect(within(first).getByLabelText('Hotel confirmation number')).toHaveValue('');
    expect(within(first).getByLabelText('Hotel contact number')).toHaveValue('+91 294 111 2222');
    expect(within(first).getByLabelText('Check-in time')).toHaveValue('14:00');
    expect(within(first).getByLabelText('Check-out time')).toHaveValue('11:00');
    expect(within(first).getByLabelText('Check-in time')).toHaveAttribute('type', 'time');
    const second = screen.getByRole('group', { name: 'Hotel 2: Hotel Moonlight' });
    expect(within(second).getByLabelText('Hotel contact number')).toHaveValue('');
    expect(screen.getByText('Jaipur', { exact: false })).toBeInTheDocument();
  });

  it('keeps what is typed for each hotel on that hotel only', async () => {
    const seen = {};
    render(<Harness initial={withHotels()} hotels={stays} onState={(f) => Object.assign(seen, f)} />);
    const second = screen.getByRole('group', { name: 'Hotel 2: Hotel Moonlight' });
    await userEvent.type(within(second).getByLabelText('Hotel confirmation number'), 'MN-77');
    await userEvent.type(within(second).getByLabelText('Hotel contact number'), '+91 141 222 3333');
    expect(seen.hotelBookings[1]).toMatchObject({ confirmationNo: 'MN-77', contactNumber: '+91 141 222 3333' });
    expect(seen.hotelBookings[0]).toMatchObject({ confirmationNo: '', contactNumber: '+91 294 111 2222' });
  });

  it('shows a problem next to the box, naming the hotel', () => {
    const initial = withHotels();
    initial.hotelBookings[1] = { confirmationNo: '', contactNumber: 'call me', checkInTime: '25:00', checkOutTime: '' };
    render(<Harness initial={initial} hotels={stays} showErrors />);
    expect(screen.getByText(/contact number of hotel 2 can only have digits/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hotel contact number', { selector: '#hotel-1-phone' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('has no hotels section for a booking without hotels (a visa, a land service)', () => {
    render(<Harness initial={start()} />);
    expect(screen.queryByRole('heading', { name: /Hotels/ })).toBeNull();
  });

  it('cannot be typed into when the booking is read only', () => {
    render(<Harness initial={withHotels()} hotels={stays} readOnly />);
    const first = screen.getByRole('group', { name: 'Hotel 1: Hotel Sunrise' });
    for (const label of ['Hotel confirmation number', 'Hotel contact number', 'Check-in time', 'Check-out time']) expect(within(first).getByLabelText(label)).toBeDisabled();
  });
});
