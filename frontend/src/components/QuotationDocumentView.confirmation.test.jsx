import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';
import { formFromConfirmation, quotationOf } from '../utils/confirmation';

// What a quotation prints once it has become a booking confirmation (hotel and package): the confirmation details under the
// destination, the hotel's own confirmation number under its name, its contact number after the address, the times after the dates,
// and no vehicle notes.

afterEach(cleanup);

const stay = (name, over = {}) => ({
  hotelName: name, city: 'Udaipur', address: '12 Lake Road', roomCategory: 'Deluxe Room', starRating: '4 star', mealPlan: 'CP (Breakfast Only)', nights: '3 Nights', noOfRooms: '1 Room',
  checkInDate: '2026-03-07', checkOutDate: '2026-03-10', contactNumber: '+91 294 111 2222', checkInTime: '14:00', checkOutTime: '11:00', ...over
});
const quote = (type, over = {}) => ({
  quotationNo: '7H-QT-2026-001', quotationType: type, clientName: 'Aarav', destination: 'UDAIPUR', paxDetails: '2 Adults', vehicleNotes: ['Vehicle will wait 30 minutes at the airport.'],
  packageDetails: { hotels: [stay('Hotel Sunrise')], inclusions: [] }, pricing: { grandTotal: 40000, totalCostPerPerson: 20000, items: [] }, ...over
});
const confirmation = (type, over = {}) => ({ confirmationNo: '7H-CF-2026-001', confirmedAt: '2026-11-04T10:00:00.000Z', status: 'Confirmed', quote: quote(type), hotelBookings: [{ confirmationNo: 'HB-2291', contactNumber: '+91 294 999 0000', checkInTime: '15:30', checkOutTime: '10:00' }], ...over });
const show = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>);
const inOrder = (text, ...parts) => parts.map((p) => text.indexOf(p)).every((n, i, a) => n >= 0 && (i === 0 || n > a[i - 1]));

describe.each([['Only Hotel'], ['Package']])('a %s confirmation', (type) => {
  const card = () => screen.getByText(/Hotel Sunrise/).closest('.quotation-keep');

  it('says "Confirmation Details" under the destination, with the confirmation number and the day it was confirmed', () => {
    show(quotationOf(confirmation(type)));
    const lines = screen.getAllByText(/Confirmation Details: 7H-CF-2026-001 • Confirmed on 04 Nov 2026/);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].parentElement.textContent).toMatch(/UDAIPUR/);
  });

  it('prints the hotel\'s confirmation number under its name, and nothing for a hotel that has none yet', () => {
    show(quotationOf(confirmation(type)));
    expect(inOrder(card().textContent, 'Hotel Sunrise', 'Hotel Confirmation No: HB-2291')).toBe(true);
    cleanup();
    show(quotationOf(confirmation(type, { hotelBookings: [{ confirmationNo: '', contactNumber: '', checkInTime: '', checkOutTime: '' }] })));
    expect(card().textContent).not.toContain('Hotel Confirmation No');
  });

  it('prints the hotel\'s contact number after its address', () => {
    show(quotationOf(confirmation(type)));
    expect(inOrder(card().textContent, '12 Lake Road', 'Hotel Contact No: +91 294 999 0000')).toBe(true);
    expect(card().textContent).not.toContain('+91 294 111 2222'); // what the booking holds replaces the hotel list's number
  });

  it('prints the times after the check-in and check-out dates, and "Time: ____" to write in when there is none', () => {
    show(quotationOf(confirmation(type)));
    expect(card().textContent).toContain('Check In: 07 Mar 2026, Time: 15:30');
    expect(card().textContent).toContain('Check Out: 10 Mar 2026, Time: 10:00');
    cleanup();
    show(quotationOf(confirmation(type, { hotelBookings: [{ confirmationNo: '', contactNumber: '', checkInTime: '', checkOutTime: '10:00' }] })));
    expect(card().textContent).toContain('Check In: 07 Mar 2026, Time: ____');
    expect(card().textContent).toContain('Check Out: 10 Mar 2026, Time: 10:00');
  });

  it('leaves out the vehicle notes', () => {
    show(quotationOf(confirmation(type)));
    expect(screen.queryByText(/Vehicle Note/)).toBeNull();
    expect(screen.queryByText(/Vehicle will wait 30 minutes/)).toBeNull();
  });

  it('does not print the hotel\'s usual "Timings" line, because the times follow the dates', () => {
    show(quotationOf(confirmation(type)));
    expect(card().textContent).not.toMatch(/Timings|Check-in from/);
  });

  it('shows what is typed on the booking page before it is saved (a preview of the form)', () => {
    const c = confirmation(type);
    const form = formFromConfirmation(c);
    form.hotelBookings[0] = { ...form.hotelBookings[0], confirmationNo: 'TYPED-77', checkOutTime: '12:00' };
    show(quotationOf(c, form));
    expect(card().textContent).toContain('Hotel Confirmation No: TYPED-77');
    expect(card().textContent).toContain('Check Out: 10 Mar 2026, Time: 12:00');
  });

  it('says CANCELLED in the confirmation line of a cancelled booking', () => {
    show(quotationOf(confirmation(type, { status: 'Cancelled' })));
    expect(screen.getAllByText(/Confirmation Details: 7H-CF-2026-001 .* CANCELLED/).length).toBeGreaterThan(0);
  });
});

describe('the same quotation before it is confirmed is exactly as it was', () => {
  it.each([['Only Hotel'], ['Package']])('a %s quotation has no confirmation line, keeps its timings and its phone label', (type) => {
    show(quote(type));
    expect(document.body.textContent).not.toContain('Confirmation Details');
    expect(document.body.textContent).not.toContain('Hotel Confirmation No');
    expect(document.body.textContent).not.toContain('Time: ____');
    const card = screen.getByText(/Hotel Sunrise/).closest('.quotation-keep').textContent;
    expect(card).toMatch(/Check-in from 14:00/);
    expect(card).toContain('+91 294 111 2222');
  });

  it('a package keeps its vehicle notes', () => {
    show(quote('Package'));
    expect(screen.getByText(/Vehicle Note/)).toBeInTheDocument();
    expect(screen.getByText(/Vehicle will wait 30 minutes/)).toBeInTheDocument();
  });

  it.each([['Events / Corporate'], ['Land Service']])('a %s quotation keeps its vehicle notes too', (type) => {
    show(quote(type));
    expect(screen.getByText(/Vehicle will wait 30 minutes/)).toBeInTheDocument();
  });

  it('a hotel quotation has no vehicle notes, and keeps the rest of its terms', () => {
    show(quote('Only Hotel', { exclusions: ['Airfare unless specified'], paymentPolicy: ['25% advance'] }));
    expect(screen.queryByText(/Vehicle Note/)).toBeNull();
    expect(screen.queryByText(/Vehicle will wait 30 minutes/)).toBeNull();
    expect(screen.getByText('Airfare unless specified')).toBeInTheDocument();
    expect(screen.getByText(/25% advance/)).toBeInTheDocument();
  });
});

describe('property', () => {
  it('whatever the hotel gave, the number comes right under the name, the contact right after the address, and nothing throws', () => {
    const word = fc.stringMatching(/^[A-Z][a-z]{5,9}$/);
    fc.assert(
      fc.property(word, word, fc.constantFrom('', '12:30', '08:05'), fc.constantFrom('Only Hotel', 'Package'), (no, name, time, type) => {
        fc.pre(no !== name);
        const c = confirmation(type, { quote: quote(type, { packageDetails: { hotels: [stay(`${name}H`, { address: 'Marg Road' })], inclusions: [] } }), hotelBookings: [{ confirmationNo: `${no}N`, contactNumber: '+91 1234 5678', checkInTime: time, checkOutTime: '' }] });
        const { container, unmount } = render(<MemoryRouter><QuotationDocumentView quotation={quotationOf(c)} /></MemoryRouter>);
        const text = [...container.querySelectorAll('.quotation-keep')].find((k) => k.textContent.includes(`${name}H`)).textContent;
        expect(inOrder(text, `${name}H`, `Hotel Confirmation No: ${no}N`)).toBe(true);
        expect(inOrder(text, 'Marg Road', 'Hotel Contact No: +91 1234 5678')).toBe(true);
        expect(text).toContain(`Check In: 07 Mar 2026, Time: ${time || '____'}`);
        expect(text).toContain('Check Out: 10 Mar 2026, Time: ____');
        unmount();
      }),
      { numRuns: 40 }
    );
  });
});
