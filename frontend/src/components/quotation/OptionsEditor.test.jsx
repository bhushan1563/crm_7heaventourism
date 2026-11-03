import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptionsEditor from './OptionsEditor';
import { blankOption } from '../../utils/quotationOptions';
import { blankStay } from '../../utils/hotelStay';
import { startRates } from '../../utils/rateTable';

afterEach(cleanup);

const hotel = (over = {}) => ({ ...blankStay(), hotelId: '0123456789abcdef01234567', hotelName: 'Hotel Sunrise', city: 'Udaipur', address: '12 Lake Road', roomOptions: ['Deluxe Room', 'Suite'], ...over });
const start = () => [{ ...blankOption(1), hotels: [hotel()], pricePerPerson: 20000 }, { ...blankOption(2), hotels: [], pricePerPerson: 0 }];

// The editor is controlled: this keeps the options the way the builder does, and shows them so a test can read them.
const Harness = ({ initial = start(), spy, type = 'Only Hotel', pax = '2 Adults' }) => {
  const [options, setOptions] = useState(initial);
  spy.current = options;
  return <OptionsEditor options={options} onChange={setOptions} paxDetails={pax} quotationType={type} canUseList onChooseHotel={vi.fn()} onSingle={vi.fn()} />;
};
const show = (initial, extra = {}) => {
  const spy = { current: null };
  render(<Harness initial={initial} spy={spy} {...extra} />);
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

describe('a hotel quotation: every hotel has its rate table and the option has a Grand Total', () => {
  const priced = () => [
    { ...blankOption(1), hotels: [hotel({ nights: '3 Nights', noOfRooms: '2 Rooms', rates: startRates() })] },
    { ...blankOption(2), hotels: [hotel({ hotelName: 'Hotel Orchid', nights: '2 Nights', noOfRooms: '1 Room', rates: startRates() })] }
  ];
  const rate = (where, value) => fireEvent.change(screen.getByLabelText(`Rate per room per night, room, ${where}`), { target: { value } });

  it('shows the table under each hotel, and no price per person box', () => {
    show(priced());
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(screen.queryByLabelText('Price per person (Rs)')).toBeNull();
    expect(screen.getByText('Grand Total of option 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Grand Total of option 1')).toHaveTextContent('—');
  });

  it('counts the Grand Total of the option as the rates are typed, and keeps it on the option for saving', () => {
    const spy = show(priced());
    rate('hotel 1, option 1', '5000');
    expect(screen.getByLabelText('Grand Total of option 1')).toHaveTextContent('Rs 30,000');
    expect(spy.current[0].totalPrice).toBe(30000);
    expect(spy.current[0].pricePerPerson).toBe(15000); // shared by the 2 guests
    rate('hotel 1, option 2', '4000');
    expect(screen.getByLabelText('Grand Total of option 2')).toHaveTextContent('Rs 8,000');
    expect(spy.current[1].totalPrice).toBe(8000);
  });

  it('adds up the hotels of an option', () => {
    const spy = show([{ ...blankOption(1), hotels: [hotel({ nights: '3 Nights', noOfRooms: '2 Rooms', rates: startRates() }), hotel({ hotelName: 'Hotel Moonlight', nights: '2 Nights', noOfRooms: '1 Room', rates: startRates() })] }, blankOption(2)]);
    rate('hotel 1, option 1', '5000');
    rate('hotel 2, option 1', '4000');
    expect(screen.getByLabelText('Grand Total of option 1')).toHaveTextContent('Rs 38,000');
    expect(spy.current[0].totalPrice).toBe(38000);
  });

  it('follows the dates: a longer stay makes the total larger', () => {
    const spy = show(priced());
    rate('hotel 1, option 1', '5000');
    date('Hotel 1 check-in date, option 1', '2026-03-07');
    date('Hotel 1 check-out date, option 1', '2026-03-12');
    expect(spy.current[0].hotels[0].nights).toBe('5 Nights');
    expect(screen.getByLabelText('Grand Total of option 1')).toHaveTextContent('Rs 50,000');
  });

  it('follows the guests only through the price per person: the total of the tables does not change', () => {
    const one = show(priced(), { pax: '2 Adults' });
    rate('hotel 1, option 1', '5000');
    expect(one.current[0]).toMatchObject({ totalPrice: 30000, pricePerPerson: 15000 });
    cleanup();
    const two = show(priced(), { pax: '4 Adults' });
    rate('hotel 1, option 1', '5000');
    expect(two.current[0]).toMatchObject({ totalPrice: 30000, pricePerPerson: 7500 });
  });

  it('takes the figures away with the last table when the hotel is removed', async () => {
    const spy = show(priced());
    rate('hotel 1, option 1', '5000');
    expect(spy.current[0].totalPrice).toBe(30000);
    await userEvent.click(screen.getByRole('button', { name: 'Remove hotel 1 from option 1' }));
    expect(spy.current[0]).toMatchObject({ hotels: [], totalPrice: 0, pricePerPerson: 0 });
    expect(screen.getByLabelText('Grand Total of option 1')).toHaveTextContent('—');
  });

  it('keeps an older option that has only a price per person, and says how to move it to the table', async () => {
    const spy = show([{ ...blankOption(1), hotels: [hotel()], pricePerPerson: 25000, totalPrice: 50000 }, blankOption(2)]);
    expect(screen.getByLabelText('Price per person (Rs)')).toHaveValue(25000);
    expect(screen.getByText(/This option was priced per person/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add the room rate of hotel 1, option 1' }));
    expect(screen.queryByLabelText('Price per person (Rs)')).toBeNull();
    expect(screen.getByText('Grand Total of option 1')).toBeInTheDocument();
    expect(spy.current[0].hotels[0].rates).toEqual(startRates());
  });

  it('is unchanged for a package: the price per person, and no rate table', () => {
    show([{ ...blankOption(1), hotels: [hotel()], pricePerPerson: 25000, totalPrice: 50000 }, blankOption(2)], { type: 'Package' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByLabelText('Price per person (Rs)')).toHaveLength(2); // every option has its own price box
    expect(screen.getAllByLabelText('Price per person (Rs)')[0]).toHaveValue(25000);
    expect(screen.getByText(/Prices are per person for 2 guests/)).toBeInTheDocument();
  });

  it('adds a hotel by hand to a hotel quotation with its room rate row ready, and says what the total is counted from', () => {
    show(priced());
    expect(screen.getByText(/the Grand Total of the option is counted from them/)).toBeInTheDocument();
  });
});
