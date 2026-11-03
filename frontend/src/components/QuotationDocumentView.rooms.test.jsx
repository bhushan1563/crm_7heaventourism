import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

afterEach(cleanup);

// The PRICING of a package, as the client's second sheet: Per room per night, No of nights, No of rooms, Total, and a Grand Total.

const room = (label, over = {}) => ({ label, rate: '', nights: null, rooms: null, ...over });
const rooms = () => [
  { name: '3 Star', layout: 'rooms', rows: [room('For 2 Adults', { rate: 5000 }), room('Extra bed', { rate: 1500, nights: 2 }), room('Child With bed'), room('Child No Bed')] },
  { name: '4 Star', layout: 'rooms', rows: [room('For 2 Adults', { rate: 8000, rooms: 2 }), room('Extra bed'), room('Child With bed'), room('Child No Bed')] }
];
const stay = (hotelName) => ({ hotelName, city: 'Udaipur', hotelId: '0123456789abcdef01234567' });
const packageQuotation = (over = {}) => ({
  quotationNo: '7H-QT-2026-002', quotationType: 'Package', clientName: 'Aarav', destination: 'UDAIPUR', paxDetails: '2 Adults', duration: '4 Nights / 5 Days',
  packageDetails: { hotels: [stay('Taj Lake Palace')], inclusions: [] },
  pricing: { grandTotal: 5, totalCostPerPerson: 5, totalCostNote: 'OLD PRICE LINE', items: [{ name: 'Package', costPerPerson: 5, note: 'Per person' }] },
  priceTables: rooms(), ...over
});
const show = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>);

describe('the PRICING of a package, per room per night', () => {
  it('prints a PRICING box, then each option with the sheet\'s columns, its rows and its Grand Total', () => {
    const { container } = show(packageQuotation());
    expect(screen.getByText('PRICING')).toBeInTheDocument();
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    const first = tables[0];
    expect(within(first).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['3 Star', 'Room', 'Per room per night', 'No of nights', 'No of rooms', 'Total']);
    const adults = within(first).getByText('For 2 Adults').closest('tr');
    expect(within(adults).getAllByRole('cell').map((c) => c.textContent)).toEqual(['For 2 Adults', '5,000', '4', '1', '20,000']); // the nights follow the trip, one room
    const extra = within(first).getByText('Extra bed').closest('tr');
    expect(within(extra).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Extra bed', '1,500', '2', '1', '3,000']);
    expect(within(first).getByText('Grand Total').closest('tr')).toHaveTextContent('Rs 23,000');
    expect(screen.getByText('Rs 64,000')).toBeInTheDocument(); // 4 Star: 8,000 x 4 nights x 2 rooms
    expect(container).not.toHaveTextContent('OLD PRICE LINE');
    expect(container).not.toHaveTextContent('Pricing Breakdown');
  });

  it('leaves the cells of a row without a rate empty, like the sheet', () => {
    show(packageQuotation());
    const row = screen.getAllByText('Child No Bed')[0].closest('tr');
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Child No Bed', '', '', '', '']);
  });

  it('a longer trip makes the nights that follow it longer', () => {
    show(packageQuotation({ duration: '6 Nights / 7 Days' }));
    const adults = screen.getAllByText('For 2 Adults')[0].closest('tr');
    expect(within(adults).getAllByRole('cell').map((c) => c.textContent)).toEqual(['For 2 Adults', '5,000', '6', '1', '30,000']);
  });

  it('works from what was typed in the form (text), so the preview matches the screen', () => {
    show(packageQuotation({ priceTables: [{ name: 'Typed', layout: 'rooms', rows: [{ label: 'For 2 Adults', rate: '2500', nights: '3', rooms: '2' }] }] }));
    const adults = screen.getByText('For 2 Adults').closest('tr');
    expect(within(adults).getAllByRole('cell').map((c) => c.textContent)).toEqual(['For 2 Adults', '2,500', '3', '2', '15,000']);
  });

  it('does not print an option with nothing entered', () => {
    const { container } = show(packageQuotation({ priceTables: [rooms()[0], { name: 'Empty', layout: 'rooms', rows: [room('For 2 Adults')] }] }));
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(container).not.toHaveTextContent('Empty');
  });

  it('a package without tables, or with only a hotel sheet, prints its old price list as before', () => {
    const sheetOnly = [{ name: 'Option 1', rows: [{ label: 'Adult', package: 1000, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }];
    for (const priceTables of [[], sheetOnly]) {
      const { container } = show(packageQuotation({ priceTables }));
      expect(screen.queryByText('PRICING')).toBeNull();
      expect(container).toHaveTextContent('OLD PRICE LINE');
      cleanup();
    }
  });

  it('a hotel quotation does not print the per room layout (the sheet it is priced with is the other one)', () => {
    show(packageQuotation({ quotationType: 'Only Hotel' }));
    expect(screen.queryByText('PRICING')).toBeNull();
  });

  it('shows hostile text in a name as plain text', () => {
    const { container } = show(packageQuotation({ priceTables: [{ name: '<img src=x onerror=alert(1)>', layout: 'rooms', rows: [room('<b>Room</b>', { rate: 100 })] }] }));
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img[onerror], b')).toBeNull();
  });
});

describe('hotel options when the pricing tables carry the prices', () => {
  const options = () => [
    { name: '3 Star', hotels: [stay('Hotel One'), stay('Hotel Two')], pricePerPerson: 0, totalPrice: 0, priceNote: 'Per person' },
    { name: '4 Star', hotels: [stay('Hotel Three')], pricePerPerson: 0, totalPrice: 0, priceNote: 'Per person' }
  ];

  it('a hotel quotation: every hotel of every option is shown, with no price bar and no "On request"', () => {
    const sheet = [{ name: '3 Star', layout: 'sheet', rows: [{ label: 'Adult', package: 1000, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }];
    const { container } = show(packageQuotation({ quotationType: 'Only Hotel', options: options(), priceTables: sheet }));
    for (const name of ['Hotel One', 'Hotel Two', 'Hotel Three']) expect(container).toHaveTextContent(name);
    expect(container).not.toHaveTextContent('On request');
    expect(container).not.toHaveTextContent('Price per person');
    expect(container).toHaveTextContent('The price of each option is in the pricing table below');
    expect(screen.getByText('PRICING')).toBeInTheDocument();
    expect(container).toHaveTextContent('Rs 2,000');
  });

  it('a package: the option cards show the hotels only, the prices are in the PRICING table', () => {
    const { container } = show(packageQuotation({ options: options() }));
    for (const name of ['Hotel One', 'Hotel Two', 'Hotel Three']) expect(container).toHaveTextContent(name);
    expect(container).not.toHaveTextContent('On request');
    expect(container).toHaveTextContent('The price of each option is in the pricing table below');
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });

  it('options without tables are priced as before', () => {
    const priced = options().map((o, i) => ({ ...o, pricePerPerson: 20000 + i * 5000, totalPrice: 40000 + i * 10000 }));
    const { container } = show(packageQuotation({ options: priced, priceTables: [] }));
    expect(container).toHaveTextContent('Rs 20,000');
    expect(container).toHaveTextContent('Rs 25,000');
    expect(container).not.toHaveTextContent('pricing table below');
  });
});
