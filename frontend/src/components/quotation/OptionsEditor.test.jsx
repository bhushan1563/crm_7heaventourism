import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptionsEditor from './OptionsEditor';
import { blankOption } from '../../utils/quotationOptions';
import { blankStay } from '../../utils/hotelStay';

afterEach(cleanup);

const hotel = (over = {}) => ({ ...blankStay(), hotelId: '0123456789abcdef01234567', hotelName: 'Hotel Sunrise', city: 'Udaipur', address: '12 Lake Road', roomOptions: ['Deluxe Room', 'Suite'], ...over });
const start = () => [{ ...blankOption(1), hotels: [hotel()], pricePerPerson: 20000 }, { ...blankOption(2), hotels: [], pricePerPerson: 0 }];

// The editor is controlled: this keeps the options the way the builder does, and shows them so a test can read them.
const Harness = ({ initial = start(), spy }) => {
  const [options, setOptions] = useState(initial);
  spy.current = options;
  return <OptionsEditor options={options} onChange={setOptions} paxDetails="2 Adults" quotationType="Only Hotel" canUseList onChooseHotel={vi.fn()} onSingle={vi.fn()} />;
};
const show = (initial) => {
  const spy = { current: null };
  render(<Harness initial={initial} spy={spy} />);
  return spy;
};
const date = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the hotel of an option: dates, rooms and address', () => {
  it('has a check-in date, a check-out date, a number of rooms and an address for every hotel', () => {
    show();
    for (const label of ['Hotel 1 check-in date, option 1', 'Hotel 1 check-out date, option 1', 'Hotel 1 rooms, option 1', 'Hotel 1 address, option 1']) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByLabelText('Hotel 1 address, option 1')).toHaveValue('12 Lake Road'); // taken from the hotel list
    expect(screen.getByLabelText('Hotel 1 check-in date, option 1')).toHaveAttribute('type', 'date');
    expect(screen.getByText('Check-in date')).toBeInTheDocument();
    expect(screen.getByText('Check-out date')).toBeInTheDocument();
  });

  it('keeps the dates on the hotel, and the nights follow them once both are entered', () => {
    const spy = show();
    date('Hotel 1 check-in date, option 1', '2026-03-07');
    expect(spy.current[0].hotels[0]).toMatchObject({ checkInDate: '2026-03-07', nights: '1 Night' }); // nights were not touched: only one date
    date('Hotel 1 check-out date, option 1', '2026-03-10');
    expect(spy.current[0].hotels[0]).toMatchObject({ checkInDate: '2026-03-07', checkOutDate: '2026-03-10', nights: '3 Nights' });
    expect(screen.getByLabelText('Hotel 1 nights, option 1')).toHaveValue('3 Nights');
    date('Hotel 1 check-in date, option 1', '2026-03-09');
    expect(spy.current[0].hotels[0].nights).toBe('1 Night');
  });

  it('lets the nights be changed by hand afterwards, and does not touch them when the dates are backwards', async () => {
    const spy = show();
    date('Hotel 1 check-in date, option 1', '2026-03-07');
    date('Hotel 1 check-out date, option 1', '2026-03-10');
    const nights = screen.getByLabelText('Hotel 1 nights, option 1');
    await userEvent.clear(nights);
    await userEvent.type(nights, '4 Nights');
    expect(spy.current[0].hotels[0].nights).toBe('4 Nights');
    date('Hotel 1 check-out date, option 1', '2026-03-01');
    expect(spy.current[0].hotels[0]).toMatchObject({ checkOutDate: '2026-03-01', nights: '4 Nights' });
  });

  it('shows a date saved as ISO text in the date box, and clearing a date empties it', () => {
    const spy = show([{ ...blankOption(1), hotels: [hotel({ checkInDate: '2026-03-07T00:00:00.000Z', checkOutDate: '2026-03-10T00:00:00.000Z' })], pricePerPerson: 1 }, blankOption(2)]);
    expect(screen.getByLabelText('Hotel 1 check-in date, option 1')).toHaveValue('2026-03-07');
    expect(screen.getByLabelText('Hotel 1 check-out date, option 1')).toHaveValue('2026-03-10');
    date('Hotel 1 check-out date, option 1', '');
    expect(spy.current[0].hotels[0].checkOutDate).toBe('');
  });

  it('lets the rooms and the address be typed, also for a hotel taken from the list (the stay is its own copy)', async () => {
    const spy = show();
    const rooms = screen.getByLabelText('Hotel 1 rooms, option 1');
    await userEvent.clear(rooms);
    await userEvent.type(rooms, '2 Rooms');
    const address = screen.getByLabelText('Hotel 1 address, option 1');
    await userEvent.clear(address);
    await userEvent.type(address, 'Pichola, Udaipur');
    expect(spy.current[0].hotels[0]).toMatchObject({ noOfRooms: '2 Rooms', address: 'Pichola, Udaipur' });
    expect(screen.getByLabelText('Hotel 1 name, option 1')).toHaveAttribute('readonly'); // the name is still the list's
  });

  it('gives each hotel of each option its own fields, without mixing them up', () => {
    const spy = show([{ ...blankOption(1), hotels: [hotel(), hotel({ hotelName: 'Hotel Moonlight' })], pricePerPerson: 1 }, { ...blankOption(2), hotels: [hotel({ hotelName: 'Hotel Orchid' })], pricePerPerson: 1 }]);
    date('Hotel 2 check-in date, option 1', '2026-04-01');
    date('Hotel 1 check-in date, option 2', '2026-05-01');
    expect(spy.current[0].hotels.map((h) => h.checkInDate || '')).toEqual(['', '2026-04-01']);
    expect(spy.current[1].hotels.map((h) => h.checkInDate || '')).toEqual(['2026-05-01']);
  });
});
