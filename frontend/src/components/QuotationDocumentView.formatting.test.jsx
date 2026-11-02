import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

afterEach(cleanup);

const bold = (text) => `<p><strong>${text}</strong></p>`;
const colour = (text) => `<p><span style="color:#dc2626;font-size:14px">${text}</span></p>`;
const marked = (text) => `<p><mark style="background-color:#fde047">${text}</mark></p>`;
const show = (quotation) => render(<MemoryRouter><QuotationDocumentView quotation={quotation} /></MemoryRouter>);

const base = (over = {}) => ({
  quotationNo: '7H-QT-2026-001', quotationType: 'Package', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults',
  itinerary: [{ dayNumber: 'Day 01', title: 'Arrival', description: 'Meet' }],
  packageDetails: { hotels: [], inclusions: [], roomInfo: '' },
  pricing: { grandTotal: 120000, totalCostPerPerson: 60000, items: [] },
  ...over
});

describe('every printed free text can be formatted', () => {
  it('the price line, the pricing notes, the room allocation, the flight note and the end-of-tour banner', () => {
    show(base({
      endOfTourNote: bold('The End'),
      packageDetails: { hotels: [], inclusions: [], roomInfo: colour('2 Double rooms') },
      asPerFlightTicket: true,
      flightTicketNote: marked('As per ticket'),
      pricing: { grandTotal: 120000, totalCostPerPerson: 60000, items: [], totalCostNote: bold('Rs 60,000 per person'), notes: '<ul><li>GST extra</li><li>Tolls extra</li></ul>' }
    }));
    expect(screen.getByText('The End').closest('strong')).not.toBeNull();
    expect(screen.getByText('2 Double rooms').closest('span[style]')).toHaveStyle({ color: '#dc2626' });
    expect(screen.getByText('As per ticket').closest('mark')).not.toBeNull();
    expect(screen.getByText('Rs 60,000 per person').closest('strong')).not.toBeNull();
    expect(screen.getByText('GST extra').closest('li')).not.toBeNull();
    expect(screen.getByText('Tolls extra').closest('ul')).not.toBeNull();
  });

  it('plain text is shown exactly as it was typed, including line breaks', () => {
    const { container } = show(base({ endOfTourNote: '***End of the Tour***', flightTicketNote: 'Line one\nLine two', asPerFlightTicket: true, pricing: { grandTotal: 1, totalCostPerPerson: 1, items: [], totalCostNote: 'Rs 1 Per person', notes: 'Pay 50% & rest later' } }));
    expect(container).toHaveTextContent('***End of the Tour***');
    expect(container).toHaveTextContent('Rs 1 Per person');
    expect(container).toHaveTextContent('Pay 50% & rest later');
    const flight = screen.getByText(/Line one/);
    expect(flight.innerHTML).toContain('<br>');
    expect(flight).toHaveTextContent('Line two');
  });

  it('hostile markup is neutralised on the way out, whatever is stored', () => {
    const evil = '<p onclick="steal()"><strong>Safe words</strong><img src=x onerror="steal()"><script>steal()</script><a href="javascript:steal()">link</a></p>';
    const { container } = show(base({ endOfTourNote: evil, flightTicketNote: evil, asPerFlightTicket: true, packageDetails: { hotels: [], inclusions: [], roomInfo: evil }, pricing: { grandTotal: 1, totalCostPerPerson: 1, items: [], totalCostNote: evil, notes: evil } }));
    expect(screen.getAllByText('Safe words').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[onerror], img[src="x"]')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('the notes of a vehicle and the price note of a land service', () => {
    show(base({
      quotationType: 'Land Service',
      vehicles: [{ vehicleType: 'SUV', seats: 7, acType: 'AC', quantity: 1, rate: 18500, notes: bold('With driver') }],
      landService: { route: 'Delhi - Agra', priceNote: colour('GST extra') },
      vehicleInclusions: []
    }));
    expect(screen.getByText('With driver').closest('strong')).not.toBeNull();
    expect(screen.getByText('GST extra').closest('span[style]')).toHaveStyle({ color: '#dc2626' });
  });

  it('the price note of a visa quotation', () => {
    show(base({ quotationType: 'Visa', visa: { country: 'UAE', applicants: 2, priceNote: marked('Fees may change') }, visaFees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }] }));
    expect(screen.getByText('Fees may change').closest('mark')).not.toBeNull();
  });

  it('the price note of each hotel option', () => {
    show(base({
      options: [
        { name: 'Option A', hotels: [{ hotelName: 'Hotel A' }], pricePerPerson: 30000, totalPrice: 60000, priceNote: bold('per person, twin sharing') },
        { name: 'Option B', hotels: [{ hotelName: 'Hotel B' }], pricePerPerson: 45000, totalPrice: 90000, priceNote: 'Per person' }
      ]
    }));
    expect(screen.getByText('per person, twin sharing').closest('strong')).not.toBeNull();
  });
});
