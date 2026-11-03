import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptionsEditor from './OptionsEditor';
import { blankOption } from '../../utils/quotationOptions';
import { blankStay } from '../../utils/hotelStay';
import { startRates } from '../../utils/rateTable';

afterEach(cleanup);

// When the pricing tables carry the prices (a hotel or package quotation), the options only choose hotels.

const hotel = (over = {}) => ({ ...blankStay(), hotelId: '0123456789abcdef01234567', hotelName: 'Hotel Sunrise', city: 'Udaipur', address: '12 Lake Road', ...over });
const two = () => [
  { ...blankOption(1), name: '3 Star', hotels: [hotel(), hotel({ hotelName: 'Hotel Moon' })] },
  { ...blankOption(2), name: '4 Star', hotels: [hotel({ hotelName: 'Hotel Orchid' })] }
];

const Harness = ({ initial = two(), spy, type = 'Only Hotel', pricedByTables = true }) => {
  const [options, setOptions] = useState(initial);
  spy.current = options;
  return <OptionsEditor options={options} onChange={setOptions} paxDetails="2 Adults" quotationType={type} pricedByTables={pricedByTables} canUseList onChooseHotel={vi.fn()} onSingle={vi.fn()} />;
};
const show = (initial, extra = {}) => {
  const spy = { current: null };
  render(<Harness initial={initial} spy={spy} {...extra} />);
  return spy;
};

describe('options when the prices are in the pricing tables', () => {
  it('a hotel quotation: several hotels in each option, no rate table, no price box, and a pointer to the Pricing tab', () => {
    show();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByLabelText('Price per person (Rs)')).toBeNull();
    expect(screen.queryByText(/Grand Total of option/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Add the room rate/ })).toBeNull();
    expect(screen.getAllByText(/The price of this option is in the pricing table/)).toHaveLength(2);
    expect(screen.getByText(/The prices are in the pricing table on the Pricing tab/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hotel Moon')).toBeInTheDocument();
  });

  it('a package: the same, with "packages" in the hint', () => {
    show(two(), { type: 'Package' });
    expect(screen.queryByLabelText('Price per person (Rs)')).toBeNull();
    expect(screen.getAllByText(/The price of this option is in the pricing table/)).toHaveLength(2);
    expect(screen.getByText(/3 star and 4 star packages/)).toBeInTheDocument();
  });

  it('a hotel that still carries an old rate table does not show it, and keeps it untouched in the data', () => {
    const spy = show([{ ...blankOption(1), hotels: [hotel({ rates: startRates() })] }, blankOption(2)]);
    expect(screen.queryByRole('table')).toBeNull();
    expect(spy.current[0].hotels[0].rates).toEqual(startRates());
  });

  it('options are still named, added and removed', async () => {
    const spy = show();
    await userEvent.click(screen.getByRole('button', { name: /Add option/i }));
    expect(spy.current).toHaveLength(3);
  });

  it('without the pricing tables the editor is as it was: a price per person for each option of a package', () => {
    show(two(), { type: 'Package', pricedByTables: false });
    expect(screen.getAllByLabelText('Price per person (Rs)')).toHaveLength(2);
    expect(screen.queryByText(/The price of this option is in the pricing table/)).toBeNull();
  });
});
