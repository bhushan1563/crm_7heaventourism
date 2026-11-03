import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';
import { optionTotal } from '../utils/hotelRates';

// A hotel quotation's options printed as a proposal: a header per option, each hotel with its rate table (the client's sheet), and
// the Grand Total of the option.

afterEach(cleanup);

const room = (rate, over = {}) => ({ kind: 'room', label: '2 Adults', rate, nights: null, rooms: null, ...over });
const bed = (rate, over = {}) => ({ kind: 'extraBed', label: 'Extra bed', rate, nights: null, rooms: null, ...over });
const stay = (name, rates, over = {}) => ({ hotelName: name, city: 'Udaipur', address: '12 Lake Road', roomCategory: 'Deluxe Room', starRating: '3 star', mealPlan: 'CP (Breakfast Only)', nights: '3 Nights', noOfRooms: '2 Rooms', checkInDate: '2026-03-07', checkOutDate: '2026-03-10', rates, ...over });
const option = (name, hotels, over = {}) => ({ name, hotels, recommended: false, pricePerPerson: 0, totalPrice: 0, priceNote: 'Per person', ...over });
const quotation = (options, over = {}) => ({
  quotationNo: '7H-QT-2026-001', quotationType: 'Only Hotel', clientName: 'Aarav', destination: 'UDAIPUR', paxDetails: '2 Adults',
  packageDetails: { hotels: [], inclusions: [] }, pricing: { grandTotal: 0, items: [] }, options, ...over
});
const show = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>);
const cells = (tr) => within(tr).getAllByRole('cell').map((c) => c.textContent);

const sample = () => [
  option('3 Star Hotels', [stay('Hotel Sunrise', [room(5000), bed(1500)]), stay('Hotel Moonlight', [room(4000)], { nights: '2 Nights', noOfRooms: '1 Room', checkInDate: '2026-03-10', checkOutDate: '2026-03-12' })]),
  option('4 Star Hotels', [stay('Hotel Orchid', [room(9000, { rooms: 1 })], { starRating: '4 star' })], { recommended: true, priceNote: 'Taxes extra' })
];

describe('the options of a hotel quotation, printed as a proposal', () => {
  it('prints a header per option, with its number and its name, and a ribbon on the recommended one', () => {
    show(quotation(sample()));
    expect(screen.getByText('OPTION 1')).toBeInTheDocument();
    expect(screen.getByText('OPTION 2')).toBeInTheDocument();
    expect(screen.getByText('3 Star Hotels')).toBeInTheDocument();
    expect(screen.getByText('4 Star Hotels')).toBeInTheDocument();
    expect(screen.getAllByText('★ RECOMMENDED')).toHaveLength(1);
  });

  it('prints the client\'s table for each hotel: Room, Per room per night, No of nights, No of rooms, Total', () => {
    show(quotation(sample()));
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(3); // two hotels in option 1, one in option 2
    expect(within(tables[0]).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Room', 'Per room per night (Rs)', 'No of nights', 'No of rooms', 'Total (Rs)']);
    const rows = within(tables[0]).getAllByRole('row');
    expect(cells(rows[1])).toEqual(['2 Adults', '5,000', '3', '2', '30,000']); // nights and rooms follow the stay
    expect(cells(rows[2])).toEqual(['Extra bed', '1,500', '3', '1', '4,500']); // an extra bed counts one
  });

  it('shows a Hotel total only for a hotel with more than one row, and the Grand Total of each option', () => {
    show(quotation(sample()));
    const [first, second, third] = screen.getAllByRole('table');
    expect(within(first).getByText('Hotel total').closest('tr')).toHaveTextContent('34,500');
    expect(within(second).queryByText('Hotel total')).toBeNull();
    expect(within(third).queryByText('Hotel total')).toBeNull();
    const grand = screen.getAllByText('Grand Total');
    expect(grand).toHaveLength(2);
    expect(grand[0].parentElement).toHaveTextContent('Rs 42,500'); // 30,000 + 4,500 + 8,000
    expect(grand[1].parentElement).toHaveTextContent('Rs 27,000'); // 9,000 x 3 nights x 1 room (the row says 1 room)
  });

  it('leaves out a row that has no rate (an extra bed that was added but not priced)', () => {
    show(quotation([option('3 Star', [stay('Hotel Sunrise', [room(5000), bed(0)])]), option('4 Star', [stay('Hotel Orchid', [room(9000)])])]));
    expect(screen.queryByText('Extra bed')).toBeNull();
    expect(screen.queryByText('Hotel total')).toBeNull();
  });

  it('prints the dates in the client\'s format, the room and the address, and the note under the Grand Total (not the default "Per person")', () => {
    show(quotation(sample()));
    expect(document.body.textContent).toContain('Check In: 07 Mar 2026');
    expect(document.body.textContent).toContain('Check Out: 10 Mar 2026');
    expect(screen.getAllByText('Deluxe Room').length).toBeGreaterThan(0);
    expect(screen.getByText('Taxes extra')).toBeInTheDocument();
    expect(screen.queryByText('Per person')).toBeNull();
  });

  it('says "Hotels to be confirmed" for an option with no hotel yet', () => {
    show(quotation([option('3 Star', []), option('4 Star', [stay('Hotel Orchid', [room(9000)])])]));
    expect(screen.getByText('Hotels to be confirmed')).toBeInTheDocument();
  });

  it('keeps an older option that has only a price per person: it prints that price and its total', () => {
    show(quotation([option('Old', [stay('Hotel Old', [])], { pricePerPerson: 25000, totalPrice: 50000 }), option('Old 2', [stay('Hotel Old 2', [])])]));
    expect(screen.getByText('Price per person').parentElement).toHaveTextContent('Rs 25,000');
    expect(screen.getByText('Total: Rs 50,000')).toBeInTheDocument();
    expect(screen.getByText('On request')).toBeInTheDocument(); // the second has no price yet
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('never nests one keep-together block inside another, so the PDF can move them to the next page one by one', () => {
    const { container } = show(quotation(sample()));
    expect(container.querySelectorAll('.quotation-keep').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('.quotation-keep .quotation-keep')).toHaveLength(0);
  });

  it('puts the option header with the first hotel and the Grand Total with the last, so neither is left alone on a page', () => {
    const { container } = show(quotation([option('3 Star', [stay('A', [room(1000)]), stay('B', [room(2000)]), stay('C', [room(3000)])]), option('4 Star', [stay('D', [room(1)])])]));
    const keeps = [...container.querySelectorAll('.quotation-keep')];
    const withHeader = keeps.filter((k) => k.textContent.includes('OPTION 1'));
    const withTotal = keeps.filter((k) => k.textContent.includes('Grand Total') && k.textContent.includes('Rs 36,000')); // 6,000 + 12,000 + 18,000
    expect(keeps.filter((k) => k.querySelector('table'))).toHaveLength(4); // one block per hotel: three in option 1, one in option 2
    expect(withHeader).toHaveLength(1);
    expect(withHeader[0].textContent).toContain('A'); // the header is with the first hotel
    expect(withTotal).toHaveLength(1);
    expect(withTotal[0].textContent).toContain('18,000'); // the total is with the last hotel's table
    expect(withTotal[0]).not.toBe(withHeader[0]);
  });
});

describe('a packages quotation with options is not changed', () => {
  it('still prints the side-by-side cards with the price per person, and no rate table', () => {
    show(quotation([option('Option A', [stay('Hotel A', [])], { pricePerPerson: 25000, totalPrice: 50000 }), option('Option B', [stay('Hotel B', [])], { pricePerPerson: 40000, totalPrice: 80000 })], { quotationType: 'Package' }));
    expect(screen.getByText('Rs 25,000')).toBeInTheDocument();
    expect(screen.getByText('Total: Rs 50,000')).toBeInTheDocument();
    expect(screen.queryByText('OPTION 1')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('a confirmed hotel booking (one hotel list, no options)', () => {
  it('prints the rate table of each hotel and the Grand Total, not a price per person', () => {
    const booking = quotation([], {
      packageDetails: { hotels: [stay('Hotel Sunrise', [room(5000), bed(1500)])], inclusions: [] },
      pricing: { grandTotal: 34500, totalCostPerPerson: 0, totalCostNote: 'Grand Total as per the rates of the hotels above', items: [] }
    });
    show(booking);
    const table = screen.getByRole('table');
    expect(cells(within(table).getAllByRole('row')[1])).toEqual(['2 Adults', '5,000', '3', '2', '30,000']);
    expect(screen.getByText(/Grand Total: Rs 34,500/)).toBeInTheDocument();
    expect(screen.getByText('Grand Total as per the rates of the hotels above')).toBeInTheDocument();
    expect(screen.queryByText(/Total Package/)).toBeNull();
  });

  it('still says Total Package for a package', () => {
    show(quotation([], { quotationType: 'Package', packageDetails: { hotels: [{ hotelName: 'H', city: 'Goa', nights: '2 Nights' }], inclusions: [] }, pricing: { grandTotal: 40000, totalCostPerPerson: 20000, items: [] } }));
    expect(screen.getByText(/Total Package: Rs 40,000/)).toBeInTheDocument();
  });
});

describe('property', () => {
  it('the Grand Total printed for an option is always the sum of its tables, however many hotels, rows, nights and rooms', () => {
    const rate = fc.integer({ min: 1, max: 30000 });
    const hotel = fc.record({ nights: fc.constantFrom('1 Night', '2 Nights', '5 Nights'), noOfRooms: fc.constantFrom('1 Room', '2 Rooms', '3 Rooms'), room: rate, bed: fc.oneof(fc.constant(0), rate) });
    fc.assert(
      fc.property(fc.array(hotel, { minLength: 1, maxLength: 3 }), (hotels) => {
        const built = hotels.map((h, i) => stay(`Hotel ${String.fromCharCode(65 + i)}`, [room(h.room), bed(h.bed)], { nights: h.nights, noOfRooms: h.noOfRooms }));
        const opts = [option('First', built), option('Second', [stay('Z', [room(100)])])];
        const { container, unmount } = render(<MemoryRouter><QuotationDocumentView quotation={quotation(opts)} /></MemoryRouter>);
        const grand = within(container).getAllByText('Grand Total')[0].parentElement.textContent;
        expect(grand).toContain(`Rs ${optionTotal(opts[0]).toLocaleString('en-IN')}`);
        expect(container.querySelectorAll('.quotation-keep .quotation-keep')).toHaveLength(0);
        unmount();
      }),
      { numRuns: 40 }
    );
  });
});
