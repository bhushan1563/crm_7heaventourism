import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

describe('a long itinerary day can run on over the page', () => {
  const lines = ['6:30AM Pick up at the hotel', '7:15AM ETA in Pier 1', '8:00AM Take the ferry', '10:00AM ETA in Tagbilaran'];
  const day = (description, over = {}) => ({ dayNumber: 'Day 04', title: 'CEBU - BOHOL - CEBU', description, ...over });
  const cards = (container) => [...container.querySelectorAll('.quotation-flow > .qd-day')];

  it('has its day heading and its title in the navy band of the day, with no yellow highlight', () => {
    const { container } = show(base({ itinerary: [day('Meet'), day('Free', { dayNumber: 'Day 05', title: 'FREE TIME' })] }));
    const [first, second] = cards(container);
    expect(first.querySelector('.qd-day-band .dt')).toHaveTextContent('Day 1');
    expect(first.querySelector('.qd-day-band .ti')).toHaveTextContent('CEBU - BOHOL - CEBU');
    expect(second.querySelector('.qd-day-band .dt')).toHaveTextContent('Day 2');
    expect(second.querySelector('.qd-day-band .ti')).toHaveTextContent('FREE TIME');
    for (const heading of container.querySelectorAll('.qd-day-band .dt, .qd-day-band .ti')) expect(heading.getAttribute('style') || '').not.toMatch(/background/i);
  });

  it('is laid out as one block for each day, with every line of the day as its own bullet, in order', () => {
    const { container } = show(base({ itinerary: [day(`<p>${lines.join('<br>')}</p>`), { dayNumber: 'Day 05', title: 'Free time', description: 'The day is free.' }] }));
    const [first, second] = cards(container);
    expect(first).toHaveTextContent('CEBU - BOHOL - CEBU');
    expect([...first.querySelectorAll('li')].map((li) => li.textContent)).toEqual(lines);
    expect(second).toHaveTextContent('Free time');
    expect(second).toHaveTextContent('The day is free.');
    expect(container.querySelectorAll('.quotation-keep .quotation-keep')).toHaveLength(0);
  });

  it('keeps a short day, and a day without text, as one block, and a day\'s photos with it', () => {
    const { container } = show(base({ itinerary: [day('One line only'), day('', { dayNumber: 'Day 05' })] }));
    const [first, second] = cards(container);
    expect(cards(container)).toHaveLength(2);
    expect(first).toHaveTextContent('One line only');
    expect(second).toHaveTextContent('Day 2');
    expect(second.querySelectorAll('li')).toHaveLength(1); // a day without text says its details follow
  });

  it('keeps list items and paragraphs, with their formatting, each as its own bullet', () => {
    const { container } = show(base({ itinerary: [day('<p><strong>Highlights</strong></p><ul><li>Trekking</li><li><span style="color:#dc2626">Cliff jumps</span></li></ul>')] }));
    expect(container.querySelector('.qd-day strong')).toHaveTextContent('Highlights');
    expect(screen.getByText('Trekking').closest('li')).not.toBeNull();
    expect(screen.getByText('Cliff jumps').closest('span[style]')).toHaveStyle({ color: '#dc2626' });
    expect(screen.getByText('Cliff jumps').closest('li')).not.toBe(screen.getByText('Trekking').closest('li'));
  });

  it('prints the day text in the size of the page, whatever size it was typed in', () => {
    const { container } = show(base({
      itinerary: [day('<p><span style="font-size:14px">Normal text</span></p><p><span style="font-size:18px">Larger text</span></p>')],
      packageDetails: { hotels: [], roomInfo: '', inclusions: ['<p><span style="font-size:14px">Five nights stay</span></p>'] }
    }));
    const card = within(container.querySelector('.qd-day')); // the list of days repeats a few words of each day, as plain text
    expect(card.getByText('Normal text').closest('span[style]').getAttribute('style')).toContain('font-size:1em');
    expect(card.getByText('Larger text').closest('span[style]').getAttribute('style')).toContain('font-size:1.286em');
    expect(screen.getByText('Five nights stay').closest('span[style]').getAttribute('style')).toContain('font-size:1em');
    const inlineStyles = [...container.querySelectorAll('[style]')].map((el) => el.getAttribute('style')).join(' ');
    expect(inlineStyles).not.toMatch(/font-size:\s*1[48]px/); // the sizes typed in the editor are made relative to the page
    expect(card.getByText('Normal text').closest('.qd-rich')).not.toBeNull();
  });

  it('has none of the old grey text left in the itinerary, the day details or the lists, and shows where the night is spent', () => {
    const { container } = show(base({ itinerary: [day('Meet', { stay: 'Cebu', meals: 'Breakfast' })], packageDetails: { hotels: [{ hotelName: 'Sea View', city: 'Cebu', address: 'Lake Road', amenities: ['Pool'] }], roomInfo: '', inclusions: ['Breakfast'] } }));
    expect(container.innerHTML).not.toMatch(/color:\s*(?:#64748b|#475569|#334155|#1f2937|#94a3b8|rgb\(100, 116, 139\)|rgb\(71, 85, 105\)|rgb\(51, 65, 85\)|rgb\(31, 41, 55\)|rgb\(148, 163, 184\))/i);
    const over = container.querySelector('.qd-day-over');
    expect(over).toHaveTextContent('Overnight');
    expect(over).toHaveTextContent('Cebu');
  });

  it('closes the itinerary with the end-of-tour note, formatted as typed', () => {
    const { container } = show(base({ endOfTourNote: bold('The End') }));
    expect(container.querySelector('.qd-end strong')).toHaveTextContent('The End');
    cleanup();
    const plain = show(base({ endOfTourNote: '' }));
    expect(plain.container.querySelector('.qd-end')).toHaveTextContent('***End of the Tour***');
  });
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
