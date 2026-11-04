import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

afterEach(cleanup);

const row = (label, over = {}) => ({ label, package: 30000, airfare: 12000, visa: 6000, tcs: 1500, pax: 2, ...over });
const sheet = () => [
  { name: 'Option 1', rows: [row('Adult'), row('Extra bed', { pax: 1 }), row('CWB', { tcs: 0, pax: 1 }), row('CNB', { pax: 0, package: 0, airfare: 0, visa: 0, tcs: 0 })] },
  { name: 'Option 2', rows: [row('Adult', { package: 36000 }), row('Extra bed', { pax: 0 }), row('CWB', { pax: 0 }), row('CNB', { pax: 0 })] }
];
const hotelQuotation = (over = {}) => ({
  quotationNo: '7H-QT-2026-001', quotationType: 'Only Hotel', clientName: 'Aarav', destination: 'TAJ LAKE PALACE', paxDetails: '2 Adults',
  packageDetails: { hotels: [{ city: 'Udaipur', hotelName: 'Taj Lake Palace' }], inclusions: [] },
  pricing: { grandTotal: 5, totalCostPerPerson: 5, totalCostNote: 'OLD PRICE LINE', items: [{ name: 'Package', costPerPerson: 5, note: 'Per person' }] },
  priceTables: sheet(), ...over
});
const show = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>);

describe('the PRICING of a hotel quotation, as on the company sheet', () => {
  it('prints a PRICING box, then each option with the sheet\'s columns, its rows and its Grand Total', () => {
    show(hotelQuotation());
    expect(screen.getByText('PRICING')).toBeInTheDocument();
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    const first = tables[0];
    expect(within(first).getByText('Option 1')).toBeInTheDocument();
    // Only Hotel: Airfare, Visa and TCS are not part of a hotel quotation, so only Package is shown.
    expect(within(first).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Option 1', 'Sr No', 'Package', 'Total', 'PAX', 'Final Price']);
    const adult = within(first).getByText('Adult').closest('tr');
    expect(within(adult).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Adult', '30,000', '30,000', '2', '60,000']);
    const grand = within(first).getByText('Grand Total').closest('tr');
    expect(grand).toHaveTextContent('Rs 1,20,000'); // (30,000×2 + 30,000×1 + 30,000×1) → pax 2+1+1 = rows; actually rowFinal = 30000 × pax: adult 60000, extrabed 30000, cwb 30000 = 120000
    expect(screen.getByText('Rs 72,000')).toBeInTheDocument(); // option 2: 36,000 × 2 = 72,000
  });

  it('uses PAX and Final Price, not the sheet\'s "No of Person" and second "Total"', () => {
    show(hotelQuotation());
    expect(screen.getAllByText('PAX').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Final Price').length).toBeGreaterThan(0);
    expect(screen.queryByText('No of Person')).toBeNull();
  });

  it('leaves cells empty where nothing was entered, like the sheet', () => {
    show(hotelQuotation());
    const cnb = screen.getAllByText('CNB')[0].closest('tr');
    // Only Hotel: columns are Sr No, Package, Total, PAX, Final Price — 5 cells (label + 4)
    expect(within(cnb).getAllByRole('cell').map((c) => c.textContent)).toEqual(['CNB', '', '', '', '']);
  });

  it('does not print an option that has nothing entered, and replaces the old price list', () => {
    const { container } = show(hotelQuotation({ priceTables: [sheet()[0], { name: 'Option 2', rows: [row('Adult', { package: 0, airfare: 0, visa: 0, tcs: 0, pax: 0 })] }] }));
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(container).not.toHaveTextContent('Option 2');
    expect(container).not.toHaveTextContent('OLD PRICE LINE');
    expect(container).not.toHaveTextContent('Pricing Breakdown');
  });

  it('a hotel quotation without tables prints its old price list as before', () => {
    const { container } = show(hotelQuotation({ priceTables: [] }));
    expect(screen.queryByText('PRICING')).toBeNull();
    expect(container).toHaveTextContent('OLD PRICE LINE');
  });

  it('other kinds of quotation never print pricing tables', () => {
    show(hotelQuotation({ quotationType: 'Package' }));
    expect(screen.queryByText('PRICING')).toBeNull();
  });

  it('works from what was typed in the form (text), so the preview matches the screen', () => {
    show(hotelQuotation({ priceTables: [{ name: 'Typed', rows: [{ label: 'Adult', package: '1000', airfare: '500', visa: '200', tcs: '100', pax: '3' }] }] }));
    const adult = screen.getByText('Adult').closest('tr');
    // Only Hotel: only the Package column is shown (Airfare, Visa, TCS are hidden); Total = Package only
    expect(within(adult).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Adult', '1,000', '1,000', '3', '3,000']);
  });

  it('shows hostile text in a name as plain text', () => {
    const { container } = show(hotelQuotation({ priceTables: [{ name: '<img src=x onerror=alert(1)>', rows: [row('<b>Adult</b>')] }] }));
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img[onerror], b')).toBeNull();
  });
});
