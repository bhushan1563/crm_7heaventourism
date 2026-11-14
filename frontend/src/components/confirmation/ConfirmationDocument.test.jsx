import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from '../QuotationDocumentView';
import BookingPage from './BookingPage';
import { bookingView, quotationOf } from '../../utils/confirmation';

afterEach(cleanup);

const confirmation = (over = {}) => ({
  _id: 'c1', confirmationNo: '7H-CF-2026-001', quotationNo: '7H-QT-2026-004', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', duration: '5 Nights / 6 Days', paxDetails: '2 Adults', optionName: 'Option B',
  status: 'Confirmed', confirmedAt: '2026-11-01T10:00:00.000Z', travelDate: '2027-04-10T00:00:00.000Z',
  travellers: [{ name: 'Aarav Mehta', age: 41, passportNo: 'Z1234567', notes: 'Vegetarian' }, { name: 'Anaya Mehta', age: 9, passportNo: '', notes: '' }],
  payment: { totalAmount: 120000, received: 40000, balanceDueDate: '2027-03-01T00:00:00.000Z', note: 'Advance by cheque' },
  notes: '<p><strong>Airport pick-up at 10:30</strong></p>', customFields: [{ label: 'Hotel voucher no.', value: 'HV-7781' }],
  quote: { quotationNo: '7H-QT-2026-004', quotationType: 'Package', clientName: 'Aarav Mehta', destination: 'RAJASTHAN', paxDetails: '2 Adults', itinerary: [{ dayNumber: 'Day 01', title: 'Arrival in Jaipur', description: 'Meet and greet' }], packageDetails: { hotels: [], inclusions: ['Breakfast'] }, pricing: { grandTotal: 120000, totalCostNote: 'Rs 60,000 Per person' } },
  ...over
});
const view = (c, form) => render(
  <MemoryRouter>
    <QuotationDocumentView quotation={quotationOf(c)} before={(parts) => <BookingPage confirmation={c} view={bookingView(c, form)} {...parts} />} />
  </MemoryRouter>
);

describe('the booking confirmation document', () => {
  it('opens with the booking details at the top of the first page, the quotation as it was sold right under them, all numbered with the confirmation number', () => {
    const { container } = view(confirmation({ showPricing: true }));
    const pages = [...container.querySelectorAll('.quotation-page')];
    expect(pages[0].id).toMatch(/-page-1$/); // no page of its own for the booking: it would stay half empty
    expect(container.querySelectorAll('.quotation-page[id$="-booking"]')).toHaveLength(0);
    expect(pages.length).toBeGreaterThanOrEqual(2); // itinerary with the booking on top, package/price
    expect(pages[0]).toHaveTextContent('Booking Confirmation');
    expect(pages[0]).toHaveTextContent('Arrival in Jaipur'); // the itinerary starts on the same page
    expect(container).toHaveTextContent('Rs 60,000 Per person');
    expect(container.querySelector('.quotation-doc-container > .quotation-page:first-child')).toBe(pages[0]);
    for (const p of pages) expect(p).toHaveTextContent('Ref: 7H-CF-2026-001');
  });

  it('lays the booking details, then the ITINERARY bar, then the days one under the other on the first page, without saying the destination twice', () => {
    const { container } = view(confirmation({ travellers: [{ name: 'Aarav Mehta', age: 41, passportNo: 'Z1', notes: '' }], notes: '<p>Airport pick-up at 10:30</p>' }));
    const first = container.querySelector('[id$="-page-1"]');
    const text = first.textContent;
    const order = ['Booking Confirmation', 'Trip Details', 'Travellers', 'Notes', 'ITINERARY', 'Day 01: Arrival in Jaipur'].map((t) => text.indexOf(t));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(first.querySelectorAll('h2')).toHaveLength(1); // one title: Booking Confirmation (the destination banner of a quotation is left out)
    expect(first.textContent.match(/Trip Details/g)).toHaveLength(1);
    // every block is a direct part of the page's flow, so the PDF can carry it over to the next sheet when the page is full
    const flow = first.querySelector('.quotation-flow');
    const booking = first.querySelector('[id$="-booking"]');
    expect(flow).toContainElement(booking);
    expect(booking).toHaveStyle({ display: 'contents' });
    expect(booking.querySelectorAll('.quotation-keep').length).toBeGreaterThan(3);
    expect(first).toHaveTextContent('Mob:'); // the footer of the page is still there, once
    expect(first.textContent.match(/Mob:/g)).toHaveLength(1);
  });

  it('shows the trip as a Trip Details table, larger than before: the name of each fact on the left, the fact on the right, one line each', () => {
    const { container } = view(confirmation({ duration: '7 Nights / 8 Days', travelDate: '2026-12-01T00:00:00.000Z', optionName: '' }));
    const first = container.querySelector('[id$="-booking"]');
    const heading = [...first.querySelectorAll('h3')].find((h) => h.textContent === 'Trip Details');
    expect(heading).toHaveStyle({ fontSize: '14px', textTransform: 'uppercase' });
    const rows = [...first.querySelectorAll('.quotation-keep')].filter((el) => el.children.length === 2 && el.children[0].tagName === 'STRONG');
    expect(rows.map((r) => [r.children[0].textContent, r.children[1].textContent])).toEqual([
      ['Guest', 'Aarav Mehta'],
      ['Destination', 'RAJASTHAN'],
      ['Travel Date', '01 Dec 2026'],
      ['Return Date', '08 Dec 2026'], // the travel date and the seven nights
      ['Duration', '7 Nights / 8 Days'],
      ['Guests', '2 Adults'],
      ['Confirmation No.', '7H-CF-2026-001'],
      ['Quotation No.', '7H-QT-2026-004'],
      ['Confirmed On', '01 Nov 2026']
    ]);
    for (const row of rows) expect(row).toHaveStyle({ fontSize: '12.5px' });
  });

  it('leaves out the Return Date when the trip has no travel date or no length', () => {
    const labels = (c) => {
      const { container } = view(c);
      const names = [...container.querySelectorAll('[id$="-booking"] .quotation-keep > strong')].map((s) => s.textContent);
      cleanup();
      return names;
    };
    expect(labels(confirmation({ travelDate: null, duration: '7 Nights / 8 Days' }))).not.toContain('Return Date');
    expect(labels(confirmation({ travelDate: '2026-12-01T00:00:00.000Z', duration: '' }))).not.toContain('Return Date');
    expect(labels(confirmation({ travelDate: '2026-12-01T00:00:00.000Z', duration: '7 Nights / 8 Days' }))).toContain('Return Date');
  });

  it('keeps the ITINERARY bar with the first day, so the PDF never leaves the bar alone at the bottom of a sheet', () => {
    const { container } = view(confirmation());
    const first = container.querySelector('[id$="-page-1"]');
    const piece = [...first.querySelectorAll('.quotation-flow .quotation-keep')].find((el) => el.textContent.includes('Day 01'));
    expect(piece).toHaveTextContent('ITINERARY');
    expect(first.textContent.match(/ITINERARY/g)).toHaveLength(1);
  });

  it('starts on the package details page when the quotation has no itinerary page, and gives the booking a page of its own only when it has neither', () => {
    const only = (quote) => view(confirmation({ quote: { quotationNo: '7H-QT-2026-004', quotationType: 'Only Hotel', clientName: 'Aarav Mehta', destination: 'UDAIPUR', paxDetails: '2 Adults', ...quote } }));
    const stay = only({ packageDetails: { hotels: [{ hotelName: 'Hotel Sunrise', city: 'Udaipur', address: 'Lake Road', checkInDate: '2027-04-10', checkOutDate: '2027-04-12', nights: '2 Nights' }], inclusions: [] } });
    const pages = [...stay.container.querySelectorAll('.quotation-page')];
    expect(pages[0].id).toMatch(/-page-2$/);
    expect(pages[0]).toHaveTextContent('Booking Confirmation');
    expect(pages[0]).toHaveTextContent('Hotel Sunrise');
    expect(stay.container.querySelectorAll('.quotation-page[id$="-booking"]')).toHaveLength(0);
    cleanup();
    const bare = only({ packageDetails: { hotels: [], inclusions: [] } });
    const own = bare.container.querySelector('.quotation-page[id$="-booking"]');
    expect(own).not.toBeNull(); // nothing to put it on: the old page of its own
    expect(own).toHaveTextContent('Booking Confirmation');
    expect(bare.container.querySelector('.quotation-doc-container > .quotation-page:first-child')).toBe(own);
  });

  it('leaves out the payment and every price unless the booking says the voucher shows them', () => {
    const { container } = view(confirmation());
    const page = document.querySelector('[id$="-booking"]');
    for (const text of ['Aarav Mehta', 'Anaya Mehta', 'Booking Confirmation', 'Trip Details']) expect(page).toHaveTextContent(text);
    for (const text of ['Payment', 'Total amount', 'Received', 'Balance to pay', 'Fully paid', 'Rs 1,20,000', 'Rs 40,000', 'Rs 80,000', 'Balance due by', 'Advance by cheque']) expect(page).not.toHaveTextContent(text);
    expect(container).toHaveTextContent('Arrival in Jaipur'); // the trip itself is all there
    for (const text of ['Rs 60,000', 'Per person', 'Grand Total', 'Pricing Breakdown', '1,20,000']) expect(container).not.toHaveTextContent(text);
    cleanup();
    const shown = view(confirmation({ showPricing: true }));
    expect(document.querySelector('[id$="-booking"]')).toHaveTextContent('Rs 1,20,000');
    expect(shown.container).toHaveTextContent('Rs 60,000 Per person');
  });

  it('follows the switch on the screen before it is saved', () => {
    const c = confirmation();
    const base = { travelDate: '2027-05-01', travellers: [], payment: { totalAmount: 10000, received: 1000, balanceDueDate: '', note: '' }, notes: '', customFields: [] };
    // as the preview of the booking page builds it: the quotation pages and the booking page both read the form on the screen
    const live = (form) => render(
      <MemoryRouter>
        <QuotationDocumentView quotation={quotationOf(c, form)} before={(parts) => <BookingPage confirmation={c} view={bookingView(c, form)} {...parts} />} />
      </MemoryRouter>
    );
    live({ ...base, showPricing: false });
    expect(document.querySelector('[id$="-booking"]')).not.toHaveTextContent('Rs 9,000');
    expect(document.body).not.toHaveTextContent('Rs 60,000 Per person');
    cleanup();
    live({ ...base, showPricing: true });
    expect(document.querySelector('[id$="-booking"]')).toHaveTextContent('Rs 9,000');
    expect(document.body).toHaveTextContent('Rs 60,000 Per person');
  });

  it('shows who and where, the travellers, the payment, the additional details and the notes', () => {
    view(confirmation({ showPricing: true }));
    const page = document.querySelector('[id$="-booking"]');
    for (const text of ['Aarav Mehta', 'RAJASTHAN', '5 Nights / 6 Days', '2 Adults', 'Option B', '7H-QT-2026-004', 'Anaya Mehta', 'Z1234567', 'Vegetarian', 'Advance by cheque', 'Hotel voucher no.', 'HV-7781', 'Airport pick-up at 10:30']) {
      expect(page).toHaveTextContent(text);
    }
    expect(page).toHaveTextContent('Rs 1,20,000');
    expect(page).toHaveTextContent('Rs 40,000');
    expect(page).toHaveTextContent('Balance to pay');
    expect(page).toHaveTextContent('Rs 80,000');
    expect(page).toHaveTextContent('Balance due by:');
    expect(page.querySelector('strong')).not.toBeNull();
  });

  it('prints the tour coordinator and the emergency contact with their numbers one under the other, and nothing when there are none', () => {
    const contacts = { coordinator: { name: 'Ravi Shah', numbers: ['+91 98765 43210', '0294 242 8800'] }, emergency: { name: 'Office', numbers: ['+91 99999 11111'] } };
    view(confirmation({ contacts }));
    const page = document.querySelector('[id$="-booking"]');
    expect(page).toHaveTextContent('Contacts');
    for (const text of ['Tour coordinator', 'Ravi Shah', '+91 98765 43210', '0294 242 8800', 'Emergency contact', 'Office', '+91 99999 11111']) expect(page).toHaveTextContent(text);
    const numbers = [...page.querySelectorAll('div')].find((el) => el.children.length === 2 && el.textContent === '+91 98765 43210' + '0294 242 8800');
    expect(numbers).toBeTruthy(); // both numbers sit in the one cell
    cleanup();
    view(confirmation());
    expect(document.querySelector('[id$="-booking"]')).not.toHaveTextContent('Contacts');
  });

  it('prints the terms, policies and exclusions page of the booking when its copy carries them, and not when it has none', () => {
    const base = confirmation().quote;
    const lists = { importantNotes: ['Carry your ID.'], paymentPolicy: ['25% Token advance.'], cancellationPolicy: ['10% if 30 days before.'], exclusions: ['Airfare unless specified'] };
    const { container } = view(confirmation({ quote: { ...base, ...lists } }));
    const terms = container.querySelector('[id$="-page-terms"]');
    expect(terms).not.toBeNull();
    for (const text of ['GENERAL POLICY', 'Carry your ID.', '25% Token advance.', '10% if 30 days before.', 'Airfare unless specified']) expect(terms).toHaveTextContent(text);
    expect(terms).not.toHaveTextContent('TERMS, POLICIES, EXCLUSIONS & GUIDELINES'); // a confirmation calls it "General Policy"
    cleanup();
    const bare = view(confirmation());
    expect(bare.container.querySelector('[id$="-page-terms"]')).toBeNull();
  });

  it('puts the additional services straight under the inclusions, and the important notes on the last page under "General Policy", above the standard terms', () => {
    const base = confirmation().quote;
    const lists = { importantNotes: ['Standard term one.'], paymentPolicy: ['25% advance.'], exclusions: ['Airfare unless specified'] };
    const { container } = view(confirmation({ quote: { ...base, ...lists }, additionalServices: '<p>Airport <strong>transfer</strong></p><p>Candle-light dinner</p>', importantNotes: '<ul><li>Carry a passport</li><li>Be early</li></ul>' }));
    const pages = [...container.querySelectorAll('.quotation-page')];
    const last = pages[pages.length - 1];
    expect(last.id).toMatch(/-page-terms$/); // the last page
    expect(last).toHaveTextContent('GENERAL POLICY');
    const text = last.textContent;
    const order = ['IMPORTANT NOTES', 'Carry a passport', 'Be early', 'TERMS', 'Standard term one.', 'POLICIES', '25% advance.', 'EXCLUSIONS'].map((t) => text.indexOf(t));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // in this order
    expect(last).not.toHaveTextContent('Additional Services'); // no longer on the last page
    expect(pages[0]).not.toHaveTextContent('Additional Services'); // nor on the booking page

    const details = container.querySelector('[id$="-page-2"]');
    const at = ['Inclusions', 'Breakfast', 'Additional Services', 'Airport transfer', 'Candle-light dinner'].map((t) => details.textContent.indexOf(t));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at); // straight under the inclusions list
    expect([...details.querySelectorAll('strong')].some((el) => el.textContent === 'transfer')).toBe(true); // the formatting is kept
  });

  it('prints the additional services larger than the standard text and each line close under the one before', () => {
    const { container } = view(confirmation({ additionalServices: '<p>Booking is confirmed for 12 pax</p><p>Safari pickup at 6 AM</p>' }));
    const lines = ['Booking is confirmed for 12 pax', 'Safari pickup at 6 AM'].map((t) => screen.getByText(t).closest('.qd-booking'));
    for (const line of lines) {
      expect(line).not.toBeNull();
      expect(line).toHaveStyle({ fontSize: '12px', color: '#000000' });
    }
    expect(lines[0]).not.toBe(lines[1]); // one piece per line, so a long text can run over the page
    expect(container.querySelector('[id$="-page-2"]')).toContainElement(lines[0]);
    expect(container.innerHTML).toMatch(/\.qd-booking\.qd-part > :last-child \{ margin-bottom: 1px; \}/); // the gap under a line is one pixel
  });

  it('shows the additional services even when the quotation has no inclusions, hotels or terms', () => {
    const { container } = view(confirmation({ quote: { ...confirmation().quote, packageDetails: { hotels: [], inclusions: [] } }, additionalServices: '<p>Private airport transfer</p>' }));
    const details = container.querySelector('[id$="-page-2"]');
    expect(details).toHaveTextContent('Additional Services');
    expect(details).toHaveTextContent('Private airport transfer');
    expect(container.querySelector('[id$="-page-terms"]')).toBeNull(); // nothing for the last page
  });

  it('prints the booking\'s own texts even when the quotation has no policies at all, and leaves them out when empty', () => {
    const { container } = view(confirmation({ importantNotes: '<p>Only this note</p>' }));
    const terms = container.querySelector('[id$="-page-terms"]');
    expect(terms).toHaveTextContent('GENERAL POLICY');
    expect(terms).toHaveTextContent('IMPORTANT NOTES');
    expect(terms).toHaveTextContent('Only this note');
    expect(terms).not.toHaveTextContent('ADDITIONAL SERVICES');
    cleanup();
    const none = view(confirmation({ additionalServices: '<p><br></p>', importantNotes: '' }));
    expect(none.container.querySelector('[id$="-page-terms"]')).toBeNull();
  });

  it('says "Fully paid" once everything is received, and leaves out empty sections', () => {
    view(confirmation({ showPricing: true, travellers: [], customFields: [], notes: '', payment: { totalAmount: 5000, received: 5000, balanceDueDate: null, note: '' }, optionName: '' }));
    const page = document.querySelector('[id$="-booking"]');
    expect(page).toHaveTextContent('Fully paid');
    expect(page).not.toHaveTextContent('Balance due by');
    for (const heading of ['Travellers', 'Additional Details', 'Notes']) expect(page).not.toHaveTextContent(heading);
    expect(page).not.toHaveTextContent('Hotel option');
  });

  it('prints what is on the screen (unsaved edits) rather than only what was saved', () => {
    const c = confirmation();
    const form = { travelDate: '2027-05-01', travellers: [{ name: 'Only Edited Name', age: '', passportNo: '', notes: '' }], payment: { totalAmount: 10000, received: 1000, balanceDueDate: '', note: '' }, showPricing: true, notes: '', customFields: [] };
    view(c, form);
    const page = document.querySelector('[id$="-booking"]');
    expect(page).toHaveTextContent('Only Edited Name');
    expect(page).not.toHaveTextContent('Anaya Mehta');
    expect(page).toHaveTextContent('Rs 9,000');
  });

  it('marks a cancelled booking clearly, with the reason', () => {
    view(confirmation({ status: 'Cancelled', cancelReason: 'Client postponed the trip' }));
    expect(document.querySelector('[id$="-booking"]')).toHaveTextContent('THIS BOOKING WAS CANCELLED: Client postponed the trip');
  });

  it('shows plain text exactly as typed, never as markup', () => {
    view(confirmation({ notes: '<script>alert(1)</script> & <b>not bold</b>', customFields: [{ label: '<i>x</i>', value: '<img src=x onerror=alert(1)>' }], travellers: [{ name: '<b>Name</b>', age: null, passportNo: '', notes: '' }] }));
    const page = document.querySelector('[id$="-booking"]');
    expect(page).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(page).toHaveTextContent('<b>Name</b>');
    expect(page.querySelector('script')).toBeNull();
    expect(page.querySelector('img[onerror], img[src="x"]')).toBeNull(); // (the logo in the header is the only image)
  });

  it('a quotation document without the extra pages is unchanged', () => {
    const { container } = render(<MemoryRouter><QuotationDocumentView quotation={quotationOf(confirmation())} /></MemoryRouter>);
    expect(container.querySelector('[id$="-booking"]')).toBeNull();
    expect(screen.queryByText('Booking Confirmation')).toBeNull();
  });
});
