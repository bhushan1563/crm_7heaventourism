import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

afterEach(cleanup);

// The per-person price list (Package Price, Airfare, Other and the add-ons): what the page and the PDF print for each component.

const item = (over) => ({ id: 'air', name: 'Airfare', costPerPerson: 5000, note: 'Per person', isIncluded: true, type: 'per_person', ...over });
const quotation = (items, over = {}) => ({
  quotationNo: '7H-QT-2026-051', quotationType: 'Package', clientName: 'Parth Shah', destination: 'SOUTH INDIA', paxDetails: '6 Adults',
  itinerary: [{ dayNumber: 'Day 01', title: 'Arrive', description: 'Meet' }], packageDetails: { hotels: [], inclusions: ['Breakfast'] },
  pricing: { items, totalCostPerPerson: 5000, grandTotal: 30000, totalCostNote: 'Rs 5,000 Per person (Incl of GST)' },
  ...over
});
const show = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>).container;
const OPTION = { name: 'Option 1', hotels: [{ hotelName: 'Hotel Sunrise', city: 'Udaipur' }], pricePerPerson: 30000, totalPrice: 180000 };

describe('the price list of a quotation', () => {
  it('prints an included Airfare with its price and note', () => {
    const page = show(quotation([item()]));
    expect(page).toHaveTextContent('Pricing Breakdown');
    expect(page).toHaveTextContent(/Airfare:\s*Rs 5,000 Per person/);
    expect(page).not.toHaveTextContent('optional, not in the total');
  });

  it('prints an Airfare marked "Excluded / Optional" as an optional extra instead of dropping it, and does not count it in the total', () => {
    const excluded = item({ isIncluded: false });
    const page = show(quotation([excluded], { pricing: { items: [excluded], totalCostPerPerson: 0, grandTotal: 0, totalCostNote: 'Rs 0 Per person' } }));
    expect(page).toHaveTextContent(/Airfare:\s*Rs 5,000 Per person \(optional, not in the total\)/);
    expect(page).not.toHaveTextContent('Total Package'); // the total stays what it was: nothing was added to it
  });

  it('leaves out an untouched line and an optional component that has no price', () => {
    const page = show(quotation([item({ id: 'pkg', name: '', costPerPerson: 0 }), item(), item({ id: 'add_1', name: 'Spa', costPerPerson: 0, isIncluded: false })]));
    expect(page).toHaveTextContent(/Airfare:\s*Rs 5,000/);
    expect(page).not.toHaveTextContent('Spa');
    expect(page.textContent).not.toMatch(/•\s*:\s*Rs 0/); // no line with no name and no price
  });

  it('prints Airfare and the add-ons under the hotel options, as Additional Components, and not the package price', () => {
    const page = show(quotation([item({ id: 'pkg', name: 'Package Price', costPerPerson: 25000 }), item(), item({ id: 'add_1', name: 'Gala dinner', costPerPerson: 1200, isIncluded: false })], { options: [OPTION] }));
    expect(page).toHaveTextContent('Hotel Sunrise');
    expect(page).toHaveTextContent('Additional Components');
    expect(page).toHaveTextContent(/Airfare:\s*Rs 5,000 Per person/);
    expect(page).toHaveTextContent(/Gala dinner:\s*Rs 1,200 Per person \(optional, not in the total\)/);
    expect(page).not.toHaveTextContent('Package Price');
    expect(page).not.toHaveTextContent('Pricing Breakdown'); // each option carries its own price
  });

  it('prints nothing extra under the options when only the package price is typed', () => {
    const page = show(quotation([item({ id: 'pkg', name: 'Package Price', costPerPerson: 25000 }), item({ costPerPerson: 0 })], { options: [OPTION] }));
    expect(page).not.toHaveTextContent('Additional Components');
  });

  it('prints none of it on a booking confirmation, which hides the prices unless the booking says to show them', () => {
    const confirmed = { ...quotation([item()]), confirmationInfo: { showPricing: false } };
    const page = show(confirmed);
    expect(page).not.toHaveTextContent('Airfare');
    expect(page).not.toHaveTextContent('Pricing Breakdown');
    cleanup();
    expect(show({ ...confirmed, options: [OPTION] })).not.toHaveTextContent('Additional Components');
  });
});
