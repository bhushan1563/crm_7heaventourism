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

describe('the tagline in the document (the closing page: thank-you, company and what it offers)', () => {
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

  it('puts the tagline on the closing page, under the company name', () => {
    const closing = renderDoc(quotation(company('Luxury holidays since 2010'))).querySelector('[id$="-back"]');
    expect(closing).toHaveTextContent('Thank you for choosing');
    expect(closing.querySelector('.pt')).toHaveTextContent('★ Luxury holidays since 2010 ★');
    expect(closing.querySelector('.nm').compareDocumentPosition(closing.querySelector('.pt')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the company name and tagline on quotations regardless: on the cover, in every running header and footer, and on the closing page', () => {
    const container = renderDoc(quotation(company('Luxury holidays since 2010')));
    const text = container.textContent;
    expect(text).toContain('7HEAVEN TOURISM');
    expect(text).toContain('Travel with Trust');
    const cover = container.querySelector('[id$="-cover"]');
    expect(cover.querySelector('.brand')).toHaveTextContent('7HEAVEN TOURISM');
    expect(cover.querySelector('.sub')).toHaveTextContent('Travel with Trust');
    const inner = [...container.querySelectorAll('.qd-page:not(.qd-cover)')];
    expect(inner.length).toBeGreaterThan(2);
    for (const page of inner) {
      expect(page.querySelector('.qd-head-brand')).toHaveTextContent('7HEAVEN TOURISM');
      expect(page.querySelector('.qd-foot-row')).toHaveTextContent('7HEAVEN TOURISM');
    }
    expect(inner.some((page) => page.querySelector('.qd-head-label'))).toBe(true);
  });

  it('prints the company name as typed, in capitals, whatever case it was saved in', () => {
    const container = renderDoc(quotation({ ...company(''), name: 'Sky Route Holidays' }));
    expect(container.querySelector('.qd-cover .brand')).toHaveTextContent('SKY ROUTE HOLIDAYS');
    expect(container.querySelector('.qd-head-brand')).toHaveTextContent('SKY ROUTE HOLIDAYS');
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
