import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RateTable from './RateTable';
import { startRates } from '../../utils/rateTable';

afterEach(cleanup);

const WHERE = 'hotel 1, option 1';
const Harness = ({ initial, spy }) => {
  const [stay, setStay] = useState(initial);
  spy.current = stay;
  return <RateTable stay={stay} where={WHERE} onChange={(rates) => setStay((s) => ({ ...s, rates }))} />;
};
const show = (stay = {}) => {
  const spy = { current: null };
  render(<Harness initial={{ nights: '3 Nights', noOfRooms: '2 Rooms', rates: startRates(), ...stay }} spy={spy} />);
  return spy;
};
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const total = (name) => screen.getByLabelText(`Total, ${name}, ${WHERE}`).textContent;

describe('the rate table of a hotel (the client\'s sheet)', () => {
  it('has the five columns of the sheet and the room for 2 adults as the first row', () => {
    show();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent).slice(0, 5)).toEqual(['Room', 'Per room per night (Rs)', 'No of nights', 'No of rooms', 'Total (Rs)']);
    expect(screen.getByLabelText(`Name of the room row, ${WHERE}`)).toHaveValue('2 Adults');
  });

  it('shows the nights and the rooms of the stay in grey until something is typed, and counts the total', () => {
    show();
    expect(screen.getByLabelText(`Nights, room, ${WHERE}`)).toHaveAttribute('placeholder', '3');
    expect(screen.getByLabelText(`Rooms, room, ${WHERE}`)).toHaveAttribute('placeholder', '2');
    expect(total('room')).toBe(''); // nothing to count yet
    type(`Rate per room per night, room, ${WHERE}`, '5000');
    expect(total('room')).toBe('30,000');
    expect(screen.getByText('Rs 30,000')).toBeInTheDocument(); // the hotel total
  });

  it('keeps a typed number of nights or rooms for the row, and goes back to following the stay when it is cleared', () => {
    const spy = show();
    type(`Rate per room per night, room, ${WHERE}`, '5000');
    type(`Nights, room, ${WHERE}`, '2');
    expect(spy.current.rates[0].nights).toBe(2);
    expect(total('room')).toBe('20,000');
    type(`Rooms, room, ${WHERE}`, '1');
    expect(total('room')).toBe('10,000');
    type(`Nights, room, ${WHERE}`, '');
    type(`Rooms, room, ${WHERE}`, '');
    expect(spy.current.rates[0]).toMatchObject({ nights: null, rooms: null });
    expect(total('room')).toBe('30,000');
  });

  it('follows the stay when its nights change (the dates were changed)', () => {
    const spy = { current: null };
    const { rerender } = render(<RateTable stay={{ nights: '3 Nights', noOfRooms: '2 Rooms', rates: [{ kind: 'room', label: '2 Adults', rate: 5000, nights: null, rooms: null }] }} where={WHERE} onChange={() => {}} />);
    expect(screen.getByLabelText(`Total, room, ${WHERE}`).textContent).toBe('30,000');
    rerender(<RateTable stay={{ nights: '5 Nights', noOfRooms: '2 Rooms', rates: [{ kind: 'room', label: '2 Adults', rate: 5000, nights: null, rooms: null }] }} where={WHERE} onChange={() => {}} />);
    expect(screen.getByLabelText(`Total, room, ${WHERE}`).textContent).toBe('50,000');
    expect(spy.current).toBeNull();
  });

  it('offers the three optional rows as buttons, adds one when pressed, and the button goes away', async () => {
    const spy = show();
    for (const name of ['extra bed', 'child with bed', 'child with no bed']) expect(screen.getByRole('button', { name: `Add ${name} row, ${WHERE}` })).toBeInTheDocument();
    expect(screen.getByText('Child no bed')).toBeInTheDocument(); // the button says it the way the client does
    await userEvent.click(screen.getByRole('button', { name: `Add extra bed row, ${WHERE}` }));
    expect(spy.current.rates.map((r) => r.kind)).toEqual(['room', 'extraBed']);
    expect(screen.queryByRole('button', { name: `Add extra bed row, ${WHERE}` })).toBeNull();
    expect(screen.getByLabelText(`Name of the extra bed row, ${WHERE}`)).toHaveValue('Extra bed');
  });

  it('counts an extra bed as one bed for each night unless the row says otherwise', async () => {
    show();
    type(`Rate per room per night, room, ${WHERE}`, '5000');
    await userEvent.click(screen.getByRole('button', { name: `Add extra bed row, ${WHERE}` }));
    expect(screen.getByLabelText(`Rooms, extra bed, ${WHERE}`)).toHaveAttribute('placeholder', '1');
    type(`Rate per room per night, extra bed, ${WHERE}`, '1500');
    expect(total('extra bed')).toBe('4,500');
    expect(screen.getByText('Rs 34,500')).toBeInTheDocument();
    type(`Rooms, extra bed, ${WHERE}`, '2');
    expect(total('extra bed')).toBe('9,000');
    expect(screen.getByText('Rs 39,000')).toBeInTheDocument();
  });

  it('takes an optional row out with its button, but the room row has none', async () => {
    const spy = show();
    expect(screen.queryByRole('button', { name: /^Remove the room row/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: `Add child with bed row, ${WHERE}` }));
    type(`Rate per room per night, child with bed, ${WHERE}`, '1200');
    await userEvent.click(screen.getByRole('button', { name: `Remove the child with bed row, ${WHERE}` }));
    expect(spy.current.rates.map((r) => r.kind)).toEqual(['room']);
    expect(screen.getByRole('button', { name: `Add child with bed row, ${WHERE}` })).toBeInTheDocument(); // it can be added again
  });

  it('keeps the rows in the client\'s order, however they were added', async () => {
    const spy = show();
    await userEvent.click(screen.getByRole('button', { name: `Add child with no bed row, ${WHERE}` }));
    await userEvent.click(screen.getByRole('button', { name: `Add extra bed row, ${WHERE}` }));
    expect(spy.current.rates.map((r) => r.kind)).toEqual(['room', 'extraBed', 'childNoBed']);
  });

  it('lets the name of a row be changed (for example 1 Adult), and never accepts a negative rate or a fraction of a night', () => {
    const spy = show();
    type(`Name of the room row, ${WHERE}`, '1 Adult');
    expect(spy.current.rates[0].label).toBe('1 Adult');
    type(`Rate per room per night, room, ${WHERE}`, '-500');
    expect(spy.current.rates[0].rate).toBe(0);
    type(`Nights, room, ${WHERE}`, '2.7');
    expect(spy.current.rates[0].nights).toBe(2);
  });

  it('asks to add the room rate for a hotel that has no table yet (an older hotel in an option)', async () => {
    const spy = { current: null };
    render(<Harness initial={{ nights: '2 Nights', noOfRooms: '1 Room', rates: [] }} spy={spy} />);
    expect(screen.queryByRole('table')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: `Add the room rate of ${WHERE}` }));
    expect(spy.current.rates).toEqual(startRates());
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('says the total is 0 as a dash, not as "0", until there is something to count', () => {
    show({ nights: '' });
    type(`Rate per room per night, room, ${WHERE}`, '5000');
    expect(total('room')).toBe(''); // no nights known: nothing to count, and the cell shows a dash through CSS
  });
});
