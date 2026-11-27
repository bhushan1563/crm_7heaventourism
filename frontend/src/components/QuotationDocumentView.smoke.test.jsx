import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

afterEach(cleanup);

const show = (quotation) => render(<MemoryRouter><QuotationDocumentView quotation={quotation} /></MemoryRouter>);

describe('the quotation document with little or odd data', () => {
  it('draws only a cover and a closing page for a quotation that is still empty', () => {
    const { container } = show({ quotationType: 'Package', clientName: '', destination: '', duration: '', paxDetails: '', itinerary: [], packageDetails: { hotels: [], inclusions: [] }, options: [], priceTables: [], pricing: {} });
    expect([...container.querySelectorAll('.quotation-page')].map((p) => p.id)).toEqual(['quotation-doc-cover', 'quotation-doc-back']);
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

  it('prints each footer number once the pages are drawn, with no letter or contents page', () => {
    const { container } = show({ quotationType: 'Package', destination: 'Goa', duration: '1 Night / 2 Days', travelDate: '2026-12-12', itinerary: [{ title: 'Arrival', stay: 'Goa', description: '<p>Morning: Beach</p>' }], packageDetails: { hotels: [] }, pricing: {} });
    const numbers = [...container.querySelectorAll('[data-pageno]')].map((e) => e.textContent);
    expect(numbers[0]).toBe('02'); // the cover is page 1 and carries no number
    expect(numbers.every(Boolean)).toBe(true);
    expect(container).not.toHaveTextContent('A Note Before You Travel');
    expect(container).not.toHaveTextContent('Contents');
    expect(container.querySelector('.qd-corner')).toBeNull(); // the corner pieces of the frame are gone
    for (const foot of container.querySelectorAll('.qd-foot-row')) {
      expect([...foot.children].map((el) => el.className)).toEqual(['qd-foot-side', 'qd-foot-num', 'qd-foot-side']); // equal sides: the number is in the middle
    }
  });

  it('says why to travel with the company on the last page, above the address, in the words the client gave', () => {
    const { container } = show({ quotationType: 'Package', destination: 'Goa', companyDetails: { name: '7Heaven Tourism', address: '405 Kanha Capital, Vadodara' }, itinerary: [], packageDetails: { hotels: [] }, pricing: {} });
    const back = container.querySelector('[data-qd-back]');
    expect(back.querySelector('.why-title').textContent).toBe('Why travel with 7Heaven?');
    expect([...back.querySelectorAll('.why-head')].map((el) => el.textContent.replace('✦', '').trim())).toEqual(['We Serve More Than We Commit', 'Best Coordination Before & During Your Tour', 'No Hidden Costs', 'Professional & Experienced Drivers', 'Top-Condition Vehicles', 'And Much More…']);
    expect(back).toHaveTextContent('Clear and transparent pricing, with no surprises.');
    expect(back.textContent.indexOf('And Much More')).toBeLessThan(back.textContent.indexOf('405 Kanha Capital'));
  });

  const trip = (over = {}) => ({
    quotationType: 'Package', destination: 'Goa', companyDetails: { name: '7Heaven Tourism', address: '405 Kanha Capital, Alkapuri 390007, Vadodara', phone: '+91 9638554240' },
    itinerary: [], packageDetails: { hotels: [], inclusions: ['Breakfast'] }, exclusions: ['Airfare'], pricing: {}, ...over
  });

  it('names the operations person under "Prepared by", and the company when there is none', () => {
    const prepared = (q) => [...show(q).container.querySelectorAll('[data-qd-cover] .prep > div')].pop().querySelector('.v').textContent;
    expect(prepared(trip({ ops: 'Mayuri Vasava' }))).toBe('Mayuri Vasava');
    cleanup();
    expect(prepared(trip({ ops: ' ' }))).toBe('7Heaven Tourism');
  });

  it('puts the thank-you under "Why travel with", and ends the address with the state and country', () => {
    const { container } = show(trip());
    const text = container.querySelector('[data-qd-back]').textContent;
    const order = ['Why travel with', 'And Much More', 'Thank you for choosing', 'Vadodara, Gujarat, India'].map((t) => text.indexOf(t));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(container.querySelector('[data-qd-cover]')).toHaveTextContent('+91 9638554240 · Vadodara'); // the town, as before
    expect(container.querySelector('[data-qd-cover]')).not.toHaveTextContent('· India');
  });

  it('has no acceptance or signature block', () => {
    const { container } = show(trip());
    expect(container.querySelector('[id$="-terms"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/Acceptance|Guest signature|This itinerary is a proposal/);
  });
});

