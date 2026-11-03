import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceTablesEditor from './PriceTablesEditor';
import { startPriceTables } from '../../utils/priceTables';

afterEach(cleanup);

// The rooms layout (a package): Per room per night, No of nights, No of rooms, Total, and a Grand Total, in the same cards as the sheet.

const Harness = ({ quotation = { quotationType: 'Package', duration: '4 Nights / 5 Days' }, onState }) => {
  const [tables, setTables] = useState(() => startPriceTables(quotation));
  return (
    <PriceTablesEditor
      tables={tables}
      quotation={{ ...quotation, priceTables: tables }}
      onChange={(next) => {
        setTables(next);
        onState?.(next);
      }}
    />
  );
};
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const total = (row, option = 'Option 1') => screen.getByLabelText(`Total of ${row} in ${option}`).textContent;

describe('PriceTablesEditor: the rooms layout of a package', () => {
  it('starts like the client\'s second sheet: Option 1 and Option 2, each with the four rows and the columns Per room per night, No of nights, No of rooms, Total', () => {
    render(<Harness />);
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Option 1', 'Option 2']);
    const first = screen.getByRole('region', { name: 'Option 1' });
    expect(within(first).getAllByRole('columnheader').map((h) => h.textContent.trim()).filter(Boolean).slice(0, 5)).toEqual(['Room', 'Per room per night', 'No of nights', 'No of rooms', 'Total']);
    expect(within(first).getAllByRole('textbox').map((t) => t.value)).toEqual(['Option 1', 'For 2 Adults', 'Extra bed', 'Child With bed', 'Child No Bed']);
    expect(within(first).getByText('Grand Total')).toBeInTheDocument();
  });

  it('works out each Total and the Grand Total as the rate is typed: the nights follow the trip, the rooms start at one', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Nights of For 2 Adults in Option 1')).toHaveAttribute('placeholder', '4');
    expect(screen.getByLabelText('Rooms of For 2 Adults in Option 1')).toHaveAttribute('placeholder', '1');
    type('Rate per room per night of For 2 Adults in Option 1', '5000');
    expect(total('For 2 Adults')).toBe('20,000'); // 5,000 x 4 nights x 1 room
    type('Rooms of For 2 Adults in Option 1', '2');
    expect(total('For 2 Adults')).toBe('40,000');
    type('Rate per room per night of Extra bed in Option 1', '1500');
    type('Nights of Extra bed in Option 1', '2');
    expect(total('Extra bed')).toBe('3,000');
    const first = screen.getByRole('region', { name: 'Option 1' });
    expect(within(first).getByText('Rs 43,000')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Option 2' })).getByText('Rs 0')).toBeInTheDocument(); // an option has its own figures
  });

  it('follows the trip: a longer trip makes every row that has no nights typed larger', () => {
    const { rerender } = render(<PriceTablesEditor tables={startPriceTables({ quotationType: 'Package' }).map((t, i) => (i ? t : { ...t, rows: [{ label: 'For 2 Adults', rate: '5000', nights: '', rooms: '' }] }))} quotation={{ quotationType: 'Package', duration: '4 Nights / 5 Days' }} onChange={() => {}} />);
    expect(total('For 2 Adults')).toBe('20,000');
    const tables = startPriceTables({ quotationType: 'Package' }).map((t, i) => (i ? t : { ...t, rows: [{ label: 'For 2 Adults', rate: '5000', nights: '', rooms: '' }] }));
    rerender(<PriceTablesEditor tables={tables} quotation={{ quotationType: 'Package', duration: '7 Nights / 8 Days' }} onChange={() => {}} />);
    expect(total('For 2 Adults')).toBe('35,000');
  });

  it('keeps nights and rooms as typed text until they are sent, so an empty box stays empty', async () => {
    const seen = vi.fn();
    render(<Harness onState={seen} />);
    type('Nights of For 2 Adults in Option 1', '3');
    expect(seen.mock.calls.at(-1)[0][0].rows[0]).toMatchObject({ nights: '3', rooms: '' });
    type('Nights of For 2 Adults in Option 1', '');
    expect(seen.mock.calls.at(-1)[0][0].rows[0].nights).toBe('');
  });

  it('adds the next of the client\'s rows, then a blank one; takes a row out but keeps at least one', async () => {
    const seen = vi.fn();
    render(<Harness onState={seen} />);
    const first = () => screen.getByRole('region', { name: 'Option 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove Extra bed from Option 1' }));
    await userEvent.click(within(first()).getByRole('button', { name: /Add a row/ }));
    expect(within(first()).getByLabelText('Name of row 4 in Option 1')).toHaveValue('Extra bed'); // the one that was taken out is offered again
    await userEvent.click(within(first()).getByRole('button', { name: /Add a row/ }));
    expect(within(first()).getByLabelText('Name of row 5 in Option 1')).toHaveValue(''); // all four are there: a blank row to name
    for (const name of ['Child No Bed', 'Child With bed', 'For 2 Adults', 'Extra bed']) {
      const button = within(first()).queryByRole('button', { name: new RegExp(`^Remove ${name}`, 'i') });
      if (button && !button.disabled) await userEvent.click(button);
    }
    expect(within(first()).getAllByRole('textbox').length).toBeGreaterThanOrEqual(2); // the option's name and at least one row
  });

  it('adds, renames, copies (with its figures) and removes options, at most six, at least one', async () => {
    render(<Harness />);
    type('Name of option 1', '3 Star Package');
    expect(screen.getByRole('region', { name: '3 Star Package' })).toBeInTheDocument();
    type('Rate per room per night of For 2 Adults in 3 Star Package', '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Copy 3 Star Package' }));
    const copy = screen.getByRole('region', { name: '3 Star Package (copy)' });
    expect(within(copy).getByLabelText('Rate per room per night of For 2 Adults in 3 Star Package (copy)')).toHaveValue(5000);
    await userEvent.click(screen.getByRole('button', { name: 'Add an option' }));
    expect(screen.getByRole('region', { name: 'Option 4' })).toBeInTheDocument(); // a new option of the same layout
    expect(within(screen.getByRole('region', { name: 'Option 4' })).getByText('Per room per night')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add an option' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add an option' }));
    expect(screen.getAllByRole('region')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Add an option' })).toBeDisabled();
  });

  it('explains the layout in plain words, and is a table in every case (never a stack of boxes)', () => {
    const { container } = render(<Harness />);
    expect(screen.getByText(/rate per room per night/i, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/the nights follow your trip/)).toBeInTheDocument();
    expect(container.querySelectorAll('table.pt-rooms')).toHaveLength(2);
  });

  it('a hotel gets the sheet from the same editor, not the rooms', () => {
    const { container } = render(<Harness quotation={{ quotationType: 'Only Hotel' }} />);
    expect(container.querySelectorAll('table.pt-rooms')).toHaveLength(0);
    expect(within(screen.getByRole('region', { name: 'Option 1' })).getAllByRole('columnheader').map((h) => h.textContent.trim())).toContain('Final Price');
  });
});
