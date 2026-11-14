import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';
import { HEADER_TAGLINE, headerTagline } from '../utils/companyHeader';

afterEach(cleanup);

const PREVIOUS = 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings';
const company = (description) => ({ name: '7HEAVEN TOURISM', tagline: 'Travel with Trust', description, address: 'Vadodara', phone: '+91 7862829178', email: 'sales@7heaventourism.in', website: 'www.7heaventourism.in' });
const quotation = (companyDetails) => ({ quotationNo: '7H-QT-2026-001', quotationType: 'Package', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults', companyDetails, itinerary: [{ dayNumber: 'Day 01', title: 'Arrival', description: 'Meet' }], packageDetails: { hotels: [], inclusions: [], roomInfo: '' }, pricing: { grandTotal: 1, totalCostPerPerson: 1, items: [] } });
const header = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>).container;

describe('the tagline in the header of every document', () => {
  it('is "YOUR JOURNEY BEGINS HERE" between two stars', () => {
    expect(HEADER_TAGLINE).toBe('YOUR JOURNEY BEGINS HERE');
    expect(header(quotation(company(HEADER_TAGLINE))).textContent).toContain('★ YOUR JOURNEY BEGINS HERE ★');
  });

  it('replaces the previous default that older quotations and bookings still carry, in any letter case and with spaces around it', () => {
    for (const stored of [PREVIOUS, PREVIOUS.toUpperCase(), `  ${PREVIOUS} `, '', '   ', undefined, null]) {
      const text = header(quotation(company(stored))).textContent;
      expect(text).toContain('★ YOUR JOURNEY BEGINS HERE ★');
      expect(text).not.toContain('Cruises');
      cleanup();
    }
  });

  it('is the same when the quotation has no company details at all', () => {
    const text = header(quotation(undefined)).textContent;
    expect(text).toContain('★ YOUR JOURNEY BEGINS HERE ★');
    expect(text).not.toContain('Cruises');
  });

  it('keeps a tagline that someone typed themselves', () => {
    expect(header(quotation(company('Luxury holidays since 2010'))).textContent).toContain('★ Luxury holidays since 2010 ★');
  });
});

describe('headerTagline', () => {
  it('is the typed text, trimmed, unless it is empty or the previous default', () => {
    expect(headerTagline('Our own line ')).toBe('Our own line');
    expect(headerTagline(PREVIOUS)).toBe(HEADER_TAGLINE);
    expect(headerTagline('')).toBe(HEADER_TAGLINE);
    expect(headerTagline(undefined)).toBe(HEADER_TAGLINE);
    expect(headerTagline(0)).toBe('0');
  });
});
