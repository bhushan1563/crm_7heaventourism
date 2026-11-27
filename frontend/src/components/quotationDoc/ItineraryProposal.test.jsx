import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ItineraryProposal from './ItineraryProposal';
import { itineraryAsQuotation, itineraryModel } from './itineraryModel';
import { fill, fitIn } from './model';

afterEach(cleanup);

const company = { name: '7HEAVEN TOURISM', tagline: 'Travel with the Trust', address: '405 Kanha Capital, Vadodara', phone: '+91 7862829178', email: 'sales@7heaventourism.in', website: 'www.7heaventourism.in' };
const photo = (n, width = 1200, height = 800) => ({ token: String(n).repeat(24), width, height, caption: '' });
const singapore = {
  title: 'Singapore – A City of Wonders', destination: 'Singapore', country: 'Singapore', nights: 5,
  summary: '<p>An island country in <strong>Southeast Asia</strong>.</p>', photos: [photo('a'), photo('b')],
  days: [{ title: 'Arrival & Transfer', description: '<p>Transfer to the hotel.</p>' }, { title: 'Universal Studios', description: '<p>A full day.</p>', meals: 'Breakfast' }],
  inclusions: ['Daily breakfast'], exclusions: ['Airfare']
};
const show = (itinerary) => render(<ItineraryProposal itinerary={itinerary} company={company} id="itin" />).container;
const ids = (container) => [...container.querySelectorAll('.quotation-page')].map((p) => p.id);

describe('the itinerary in the design of a quotation', () => {
  it('has a cover, the overview, the list of days, the day cards, what is included, and the closing page', () => {
    expect(ids(show(singapore))).toEqual(['itin-cover', 'itin-overview', 'itin-shape', 'itin-days', 'itin-lists', 'itin-back']);
  });

  it('puts the destination and the title on the cover, with no guest, no trip ID and no price', () => {
    const cover = show(singapore).querySelector('#itin-cover');
    expect(cover).toHaveTextContent('Singapore');
    expect(cover).toHaveTextContent('Singapore – A City of Wonders');
    expect(cover).toHaveTextContent('5 Nights');
    expect(cover).toHaveTextContent('Presented by');
    expect(cover.textContent).not.toMatch(/Prepared exclusively for|Trip ID|Valued Guest|Rs /);
    expect(cover.querySelector('.dome img').getAttribute('src')).toContain(photo('a').token);
  });

  it('prints the overview with its formatting, every photo, each day and the lists', () => {
    const container = show(singapore);
    expect(container.querySelector('#itin-overview strong')).toHaveTextContent('Southeast Asia');
    expect(container.querySelectorAll('#itin-overview img[src*="aaaa"], #itin-overview img[src*="bbbb"]')).toHaveLength(2);
    expect(container.querySelector('#itin-overview').textContent).not.toContain('Singapore, Singapore');
    expect(container.querySelectorAll('.qd-day')).toHaveLength(2);
    expect(container.querySelector('#itin-lists')).toHaveTextContent('Daily breakfast');
    expect(container.querySelector('#itin-lists')).toHaveTextContent('Airfare');
    expect(container.querySelector('#itin-shape').textContent).not.toContain('—'); // no nights typed: no column of dashes
  });

  it('draws only what there is for a bare itinerary', () => {
    const container = show({ title: 'Weekend walk', days: [{ title: 'City walk' }] });
    expect(ids(container)).toEqual(['itin-cover', 'itin-shape', 'itin-days', 'itin-back']);
    expect(container.querySelector('#itin-cover')).not.toHaveTextContent('assistance in Weekend');
  });

  it('continues a very long list in further boxes', () => {
    const container = show({ ...singapore, inclusions: Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`) });
    const boxes = [...container.querySelectorAll('#itin-lists .qd-panel')];
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('#itin-lists')).toHaveTextContent('Item 30');
  });

  it('describes the itinerary the way the pages read a trip', () => {
    const quotation = itineraryAsQuotation({ ...singapore, destination: 'Ubud', country: 'Indonesia' }, company);
    expect(quotation.destination).toBe('Ubud, Indonesia');
    expect(itineraryModel(singapore, itineraryAsQuotation(singapore, company))).toMatchObject({ place: 'Singapore', country: '', footerLabel: 'SINGAPORE ITINERARY' });
    expect(itineraryAsQuotation({ ...singapore, nights: 0 }, company).duration).toBe('1 Day');
  });
});

describe('photo sizes (the PDF maker stretches a photo that is only fitted by CSS)', () => {
  it('fills a frame in the photo\'s own proportions, centred', () => {
    expect(fill({ width: 800, height: 1200 }, 658, 454)).toEqual({ width: 658, height: 987, left: 0, top: -266 });
    expect(fill({ width: 1600, height: 500 }, 658, 454)).toEqual({ width: 1453, height: 454, left: -397, top: -0 });
  });

  it('fits a photo whole inside a frame', () => {
    expect(fitIn({ width: 800, height: 1200 }, 656, 560)).toEqual({ width: 373, height: 560 });
    expect(fitIn({ width: 1600, height: 800 }, 656, 560)).toEqual({ width: 656, height: 328 });
  });
});
