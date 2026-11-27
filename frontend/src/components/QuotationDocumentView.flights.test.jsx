import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';
import BookingPage from './confirmation/BookingPage';
import { bookingView, quotationOf } from '../utils/confirmation';
import { mediaUrl } from '../services/mediaService';

afterEach(cleanup);

// The flights page of a quotation shows the screenshots of the flight that were pasted on the flight tab, whole, in the order they were added.

const SHOT_A = { token: 'A'.repeat(24), width: 1080, height: 1920, caption: 'Onward flight' };
const SHOT_B = { token: 'B'.repeat(24), width: 1600, height: 700, caption: '' };
const base = (over = {}) => ({
  quotationNo: '7H-QT-2026-001', quotationType: 'Package', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults',
  itinerary: [{ dayNumber: 'Day 01', title: 'Arrival', description: 'Meet' }],
  packageDetails: { hotels: [], inclusions: [], roomInfo: '' },
  pricing: { grandTotal: 120000, totalCostPerPerson: 60000, items: [] },
  ...over
});
const show = (quotation, before) => render(<MemoryRouter><QuotationDocumentView quotation={quotation} before={before} /></MemoryRouter>);
const flightsPage = (container) => container.querySelector('[id$="-flights"]');

describe('the flight screenshots on the flights page', () => {
  it('make the flights page: the heading, then each screenshot whole, in order, with its caption', () => {
    const { container } = show(base({ flightImages: [SHOT_A, SHOT_B] }));
    const page = flightsPage(container);
    expect(page).not.toBeNull();
    expect(page).toHaveTextContent('Flight Details');
    const images = [...page.querySelectorAll('img')].filter((img) => img.src.includes('/media/'));
    expect(images.map((img) => img.getAttribute('src'))).toEqual([mediaUrl(SHOT_A.token), mediaUrl(SHOT_B.token)]);
    expect(images[0]).toHaveAttribute('alt', 'Onward flight');
    expect(images[1]).toHaveAttribute('alt', 'Flight details');
    expect(images[0].closest('figure')).toHaveClass('qd-shot');
    expect(images[0]).toHaveStyle({ width: '349px', height: '620px' }); // a tall screenshot fitted whole: never cropped, never stretched
    expect(images[1]).toHaveStyle({ width: '656px', height: '287px' });
    expect(page).toHaveTextContent('Onward flight');
    expect(images[0].closest('.quotation-keep')).not.toBeNull(); // each one moves to the next sheet whole when the page is full
  });

  it('are a numbered section of the document: in the contents, after the days, with its heading', () => {
    const { container } = show(base({ flightImages: [SHOT_A] }));
    const toc = container.querySelector('.qd-toc');
    const rows = [...toc.querySelectorAll('.qd-toc-row:not(.sub)')].map((row) => [row.querySelector('.rn').textContent, row.querySelector('.tt').textContent]);
    expect(rows).toEqual([['I', 'Day by Day'], ['II', 'Flight Details'], ['III', 'Pricing']]);
    expect(within(flightsPage(container)).getByRole('heading', { name: 'Flight Details' }).closest('.qd-band')).toHaveTextContent('II');
    expect(container.querySelector('[id$="-days"]').compareDocumentPosition(flightsPage(container)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('need no typed segment and no "as per ticket" mode: the screenshots alone are the flight section', () => {
    const { container } = show(base({ flightImages: [SHOT_A], asPerFlightTicket: false, flightDetails: [] }));
    expect(flightsPage(container)).not.toBeNull();
    expect(flightsPage(container)).not.toHaveTextContent('Flight details will be as per confirmed flight ticket');
  });

  it('come with the typed flights or the ticket note when there are any, above them', () => {
    const { container } = show(base({ flightImages: [SHOT_A], flightDetails: [{ flightType: 'Departure', airline: 'Indigo', flightNumber: '6E 6805', fromAirport: 'AMD', toAirport: 'VNS' }] }));
    const page = flightsPage(container);
    expect(page.textContent.indexOf('Indigo')).toBeGreaterThan(-1);
    const image = [...page.querySelectorAll('img')].find((img) => img.src.includes('/media/'));
    expect(page.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
    expect(image.compareDocumentPosition(screen.getByText(/Indigo/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the screenshot first
  });

  it('are not there, and make no flights page, when the quotation has none (older quotations)', () => {
    for (const flightImages of [undefined, null, []]) {
      const { container } = show(base({ flightImages }));
      expect(flightsPage(container)).toBeNull();
      cleanup();
    }
  });

  it('are left out of a visa quotation, which has no flights', () => {
    const { container } = show(base({ quotationType: 'Visa', visa: { country: 'UAE', applicants: 1 }, visaFees: [], flightImages: [SHOT_A] }));
    expect(flightsPage(container)).toBeNull();
  });

  it('are in the booking confirmation, which keeps them from the quotation it was made from', () => {
    const confirmation = { _id: 'c1', confirmationNo: '7H-CF-2026-001', quotationNo: '7H-QT-2026-001', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', status: 'Confirmed', travellers: [], payment: { totalAmount: 0, received: 0 }, customFields: [], quote: base({ flightImages: [SHOT_A] }) };
    const { container } = show(quotationOf(confirmation), (parts) => <BookingPage confirmation={confirmation} view={bookingView(confirmation)} {...parts} />);
    const images = [...flightsPage(container).querySelectorAll('img')].filter((img) => img.src.includes('/media/'));
    expect(images.map((img) => img.getAttribute('src'))).toEqual([mediaUrl(SHOT_A.token)]);
  });
});
