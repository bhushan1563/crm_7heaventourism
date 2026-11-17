import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';
import { CONFIRMATION_TAGLINE, PRODUCTS_TAGLINE, headerTagline } from '../utils/companyHeader';

afterEach(cleanup);

const company = (description) => ({ name: '7HEAVEN TOURISM', tagline: 'Travel with Trust', description, address: 'Vadodara', phone: '+91 7862829178', email: 'sales@7heaventourism.in', website: 'www.7heaventourism.in' });
const quotation = (companyDetails) => ({ quotationNo: '7H-QT-2026-001', quotationType: 'Package', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults', companyDetails, itinerary: [{ dayNumber: 'Day 01', title: 'Arrival', description: 'Meet' }], packageDetails: { hotels: [], inclusions: [], roomInfo: '' }, pricing: { grandTotal: 1, totalCostPerPerson: 1, items: [] } });
const confirmation = (companyDetails) => ({ ...quotation(companyDetails), confirmationInfo: { showPricing: false } });
const renderDoc = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>).container;

describe('the tagline banner in the document header', () => {
  it('shows the products and services on a quotation, whichever standard line is stored on it', () => {
    for (const stored of [PRODUCTS_TAGLINE, CONFIRMATION_TAGLINE, '', '  ', undefined, `  ${PRODUCTS_TAGLINE.toUpperCase()} `]) {
      const text = renderDoc(quotation(company(stored))).textContent;
      expect(text).toContain(`★ ${PRODUCTS_TAGLINE} ★`);
      expect(text).not.toContain('YOUR JOURNEY BEGINS HERE');
      cleanup();
    }
  });

  it('shows the products and services on a quotation that has no company details at all', () => {
    const text = renderDoc(quotation(undefined)).textContent;
    expect(text).toContain(`★ ${PRODUCTS_TAGLINE} ★`);
    expect(text).not.toContain('YOUR JOURNEY BEGINS HERE');
  });

  it('shows "YOUR JOURNEY BEGINS HERE" on a booking confirmation, whichever standard line its quotation carried', () => {
    for (const stored of [PRODUCTS_TAGLINE, CONFIRMATION_TAGLINE, '', undefined]) {
      const text = renderDoc(confirmation(company(stored))).textContent;
      expect(text).toContain('★ YOUR JOURNEY BEGINS HERE ★');
      expect(text).not.toContain('Cruises');
      cleanup();
    }
    expect(renderDoc(confirmation(undefined)).textContent).toContain('★ YOUR JOURNEY BEGINS HERE ★');
  });

  it('keeps a tagline that someone typed themselves, on both', () => {
    expect(renderDoc(quotation(company('Luxury holidays since 2010'))).textContent).toContain('★ Luxury holidays since 2010 ★');
    cleanup();
    expect(renderDoc(confirmation(company('Luxury holidays since 2010'))).textContent).toContain('★ Luxury holidays since 2010 ★');
  });

  it('shows the company name and tagline on quotations regardless', () => {
    const text = renderDoc(quotation(company('Luxury holidays since 2010'))).textContent;
    expect(text).toContain('7HEAVEN TOURISM');
    expect(text).toContain('Travel with Trust');
  });
});

describe('headerTagline', () => {
  it('is the typed text, trimmed, unless it is empty or one of the two standard lines; those print the line of the document', () => {
    expect(headerTagline('Our own line ')).toBe('Our own line');
    expect(headerTagline(PRODUCTS_TAGLINE)).toBe(PRODUCTS_TAGLINE);
    expect(headerTagline(CONFIRMATION_TAGLINE)).toBe(PRODUCTS_TAGLINE);
    expect(headerTagline(PRODUCTS_TAGLINE, true)).toBe(CONFIRMATION_TAGLINE);
    expect(headerTagline('', true)).toBe(CONFIRMATION_TAGLINE);
    expect(headerTagline(undefined)).toBe(PRODUCTS_TAGLINE);
    expect(headerTagline(0)).toBe('0');
  });
});
