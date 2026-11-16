import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';
import { CONFIRMATION_TAGLINE } from '../utils/companyHeader';

afterEach(cleanup);

const company = (description) => ({ name: '7HEAVEN TOURISM', tagline: 'Travel with Trust', description, address: 'Vadodara', phone: '+91 7862829178', email: 'sales@7heaventourism.in', website: 'www.7heaventourism.in' });
const quotation = (companyDetails) => ({ quotationNo: '7H-QT-2026-001', quotationType: 'Package', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults', companyDetails, itinerary: [{ dayNumber: 'Day 01', title: 'Arrival', description: 'Meet' }], packageDetails: { hotels: [], inclusions: [], roomInfo: '' }, pricing: { grandTotal: 1, totalCostPerPerson: 1, items: [] } });
const confirmation = (companyDetails) => ({ ...quotation(companyDetails), confirmationInfo: { showPricing: false } });
const renderDoc = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>).container;

describe('the tagline banner in the document header', () => {
  it('does NOT show "YOUR JOURNEY BEGINS HERE" on a quotation', () => {
    const text = renderDoc(quotation(company(CONFIRMATION_TAGLINE))).textContent;
    expect(text).not.toContain('YOUR JOURNEY BEGINS HERE');
  });

  it('does NOT show "YOUR JOURNEY BEGINS HERE" on a quotation with no company details', () => {
    const text = renderDoc(quotation(undefined)).textContent;
    expect(text).not.toContain('YOUR JOURNEY BEGINS HERE');
  });

  it('shows "YOUR JOURNEY BEGINS HERE" on a confirmation voucher', () => {
    const text = renderDoc(confirmation(company(CONFIRMATION_TAGLINE))).textContent;
    expect(text).toContain('YOUR JOURNEY BEGINS HERE');
  });

  it('shows the company name and tagline on quotations regardless', () => {
    const text = renderDoc(quotation(company('Luxury holidays since 2010'))).textContent;
    expect(text).toContain('7HEAVEN TOURISM');
    expect(text).toContain('Travel with Trust');
  });
});
