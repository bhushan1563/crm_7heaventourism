import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

afterEach(cleanup);

const show = (quotation) => render(<MemoryRouter><QuotationDocumentView quotation={quotation} /></MemoryRouter>);

describe('the quotation document with little or odd data', () => {
  it('draws a cover, a welcome page and a closing page for a quotation that is still empty', () => {
    const { container } = show({ quotationType: 'Package', clientName: '', destination: '', duration: '', paxDetails: '', itinerary: [], packageDetails: { hotels: [], inclusions: [] }, options: [], priceTables: [], pricing: {} });
    expect([...container.querySelectorAll('.quotation-page')].map((p) => p.id)).toEqual(['quotation-doc-cover', 'quotation-doc-welcome', 'quotation-doc-back']);
  });

  it('draws nothing for no quotation at all', () => {
    const { container } = render(<MemoryRouter><QuotationDocumentView quotation={null} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it('survives a day with no text, no title and photos missing', () => {
    const { container } = show({ quotationType: 'Package', destination: 'Goa', duration: '1 Night / 2 Days', itinerary: [{ dayNumber: 'Day 01' }, { description: '' }], packageDetails: { hotels: [] }, pricing: {} });
    expect(container.querySelectorAll('.qd-day')).toHaveLength(2);
    expect(container).toHaveTextContent('Details of this day will be shared on confirmation.');
  });

  it('puts the chosen cover photo on the cover, else the first photo of the trip, else a drawing', () => {
    const tokenA = 'A'.repeat(24);
    const tokenB = 'B'.repeat(24);
    const base = { quotationType: 'Package', destination: 'Goa', duration: '1 Night / 2 Days', itinerary: [{ title: 'Arrival', photos: [{ token: tokenB, width: 100, height: 60 }] }], packageDetails: { hotels: [] }, pricing: {} };
    const cover = (q) => show(q).container.querySelector('[data-qd-cover]');
    expect(cover({ ...base, coverPhoto: { token: tokenA, width: 100, height: 60 } }).querySelector('img.cover-img, .dome img').getAttribute('src')).toContain(tokenA);
    cleanup();
    expect(cover(base).querySelector('.dome img').getAttribute('src')).toContain(tokenB);
    cleanup();
    expect(cover({ ...base, itinerary: [] }).querySelector('.dome img')).toBeNull();
  });

  it('prints each footer number and the contents once the pages are drawn', () => {
    const { container } = show({ quotationType: 'Package', destination: 'Goa', duration: '1 Night / 2 Days', travelDate: '2026-12-12', itinerary: [{ title: 'Arrival', stay: 'Goa', description: '<p>Morning: Beach</p>' }], packageDetails: { hotels: [] }, pricing: {} });
    const numbers = [...container.querySelectorAll('[data-pageno]')].map((e) => e.textContent);
    expect(numbers[0]).toBe('02'); // the cover is page 1 and carries no number
    expect(numbers.every(Boolean)).toBe(true);
    expect(container.querySelector('[data-toc="days"]').textContent).toMatch(/^\d\d$/);
  });
});
