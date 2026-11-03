import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

// How a hotel quotation prints the hotels, in the order the client asked for: the destination on top, then for each hotel its name,
// its room category and its address, and under them the check-in and check-out dates ("07 Mar 2026").

afterEach(cleanup);

const stay = (over = {}) => ({
  hotelName: 'Taj Lake Palace', city: 'Udaipur', address: 'Pichola, Udaipur 313001', roomCategory: 'Luxury Lake View Room', starRating: '5 star',
  mealPlan: 'CP (Breakfast Only)', nights: '3 Nights', noOfRooms: '1 Room', checkInDate: '2026-03-07T00:00:00.000Z', checkOutDate: '2026-03-10T00:00:00.000Z', ...over
});
const hotelQuotation = (over = {}) => ({
  quotationNo: '7H-QT-2026-001', quotationType: 'Only Hotel', clientName: 'Aarav', destination: 'UDAIPUR', paxDetails: '2 Adults',
  packageDetails: { hotels: [stay()], inclusions: [] }, pricing: { grandTotal: 0, items: [] }, ...over
});
const withOptions = (options, over = {}) => hotelQuotation({ packageDetails: { hotels: [], inclusions: [] }, options, ...over });
const option = (name, hotels, over = {}) => ({ name, hotels, recommended: false, pricePerPerson: 20000, totalPrice: 40000, priceNote: 'Per person', ...over });
const show = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>);
const order = (text, ...parts) => parts.map((p) => text.indexOf(p));
const inOrder = (indexes) => indexes.every((n, i) => n >= 0 && (i === 0 || n > indexes[i - 1]));

describe('a hotel quotation with one list of hotels', () => {
  it('puts the DESTINATION on top, then the hotel, its room category and its address, then the dates', () => {
    show(hotelQuotation());
    expect(screen.getByText(/UDAIPUR/, { selector: 'div' })).toBeInTheDocument();
    const card = screen.getByText('Taj Lake Palace').closest('.quotation-keep');
    const text = card.textContent;
    expect(inOrder(order(text, 'Taj Lake Palace', 'Luxury Lake View Room', 'Pichola, Udaipur 313001', 'Check In', 'Check Out'))).toBe(true);
    expect(text).toContain('Check In: 07 Mar 2026');
    expect(text).toContain('Check Out: 10 Mar 2026');
    expect(text).not.toMatch(/\bStay:/); // replaced by the two dates
  });

  it('names the city once when the address already has it, and adds it when it does not', () => {
    show(hotelQuotation({ packageDetails: { hotels: [stay({ address: 'Pichola, Udaipur 313001', city: 'Udaipur' }), stay({ hotelName: 'Hotel Sunrise', address: '12 Lake Road', city: 'Udaipur' })], inclusions: [] } }));
    expect(screen.getByText('📍 Pichola, Udaipur 313001')).toBeInTheDocument();
    expect(screen.getByText('📍 12 Lake Road, Udaipur')).toBeInTheDocument();
  });

  it('writes the dates the way the client does, not as 07-03-2026', () => {
    show(hotelQuotation());
    expect(document.body.textContent).toContain('07 Mar 2026');
    expect(document.body.textContent).not.toContain('07-03-2026');
  });

  it('leaves out a date that was not entered, and prints the other one alone', () => {
    show(hotelQuotation({ packageDetails: { hotels: [stay({ checkOutDate: '' })], inclusions: [] } }));
    const text = screen.getByText('Taj Lake Palace').closest('.quotation-keep').textContent;
    expect(text).toContain('Check In: 07 Mar 2026');
    expect(text).not.toContain('Check Out');
  });

  it('prints no date line at all when there are no dates, and no empty room line when there is no room category', () => {
    show(hotelQuotation({ packageDetails: { hotels: [stay({ checkInDate: '', checkOutDate: '', roomCategory: '' })], inclusions: [] } }));
    const text = screen.getByText('Taj Lake Palace').closest('.quotation-keep').textContent;
    expect(text).not.toMatch(/Check In|Check Out/);
    expect(text).toContain('Pichola, Udaipur 313001');
  });

  it('still prints a quotation made earlier with the hotel as its title', () => {
    show(hotelQuotation({ destination: 'TAJ LAKE PALACE, UDAIPUR' }));
    expect(screen.getAllByText(/TAJ LAKE PALACE, UDAIPUR/).length).toBeGreaterThan(0);
    expect(screen.getByText('Luxury Lake View Room')).toBeInTheDocument();
  });
});

describe('hotel options', () => {
  const options = () => [
    option('3 Star', [stay({ hotelName: 'Hotel Sunrise', roomCategory: 'Deluxe Room', address: '12 Lake Road', starRating: '3 star' }), stay({ hotelName: 'Hotel Moonlight', roomCategory: 'Standard Room', address: '9 Fort Lane', starRating: '3 star', checkInDate: '2026-03-10', checkOutDate: '2026-03-12' })]),
    option('4 Star', [stay({ hotelName: 'Hotel Orchid', roomCategory: 'Premier Room', address: '5 Palace Marg', starRating: '4 star' })])
  ];

  it('shows every hotel of every option with its room, its address and its two dates', () => {
    show(withOptions(options()));
    const first = screen.getByText('Hotel Sunrise').parentElement.parentElement;
    const text = first.textContent;
    expect(inOrder(order(text, 'Hotel Sunrise', 'Deluxe Room', '12 Lake Road', 'Check In: 07 Mar 2026', 'Check Out: 10 Mar 2026'))).toBe(true);
    const second = screen.getByText('Hotel Moonlight').parentElement.parentElement;
    expect(second.textContent).toContain('Check In: 10 Mar 2026');
    expect(second.textContent).toContain('Check Out: 12 Mar 2026');
    expect(screen.getByText('Hotel Orchid').parentElement.parentElement.textContent).toContain('5 Palace Marg');
  });

  it('keeps the address and the room out of the one-line summary, so nothing is printed twice', () => {
    show(withOptions(options()));
    const card = screen.getByText('Hotel Sunrise').parentElement.parentElement;
    expect((card.textContent.match(/Deluxe Room/g) || []).length).toBe(1);
    expect((card.textContent.match(/12 Lake Road/g) || []).length).toBe(1);
  });
});

describe('property', () => {
  it('whatever is typed for a hotel, the name always comes before its room, then its address, then its dates, and nothing throws', () => {
    const word = fc.stringMatching(/^[A-Z][a-z]{4,9}$/);
    fc.assert(
      fc.property(word, word, word, fc.constantFrom('', '2026-03-07', '2026-12-31T00:00:00.000Z'), fc.constantFrom('', '2026-03-10', '2027-01-02'), (name, room, address, inDate, outDate) => {
        fc.pre(new Set([name, room, address]).size === 3 && !'Check In Out Stay Hotel Rooms Nights'.split(' ').some((w) => [name, room, address].includes(w)));
        const { container, unmount } = render(<MemoryRouter><QuotationDocumentView quotation={hotelQuotation({ packageDetails: { hotels: [stay({ hotelName: `${name}X`, roomCategory: `${room}Y`, address: `${address}Z`, city: '', checkInDate: inDate, checkOutDate: outDate })], inclusions: [] } })} /></MemoryRouter>);
        const card = within(container).getByText(`${name}X`).closest('.quotation-keep');
        const text = card.textContent;
        expect(inOrder(order(text, `${name}X`, `${room}Y`, `${address}Z`))).toBe(true);
        if (inDate) expect(text.indexOf('Check In')).toBeGreaterThan(text.indexOf(`${address}Z`));
        if (outDate) expect(text.indexOf('Check Out')).toBeGreaterThan(text.indexOf(`${address}Z`));
        if (!inDate) expect(text).not.toContain('Check In');
        if (!outDate) expect(text).not.toContain('Check Out');
        unmount();
      }),
      { numRuns: 40 }
    );
  });
});
