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
  it('opens with the booking page, then carries the quotation as it was sold, all numbered with the confirmation number', () => {
    const { container } = view(confirmation({ showPricing: true }));
    const pages = [...container.querySelectorAll('.quotation-page')];
    expect(pages[0].id).toMatch(/-booking$/);
    expect(pages.length).toBeGreaterThanOrEqual(3); // booking page, itinerary, package/price
    expect(pages[0]).toHaveTextContent('Booking Confirmation');
    expect(container).toHaveTextContent('Arrival in Jaipur');
    expect(container).toHaveTextContent('Rs 60,000 Per person');
    expect(container.querySelector('.quotation-doc-container > .quotation-page:first-child')).toBe(pages[0]); // the booking page is the first page, as the print rules expect
    for (const p of pages) expect(p).toHaveTextContent('Ref: 7H-CF-2026-001');
  });

  it('leaves out the payment and every price unless the booking says the voucher shows them', () => {
    const { container } = view(confirmation());
    const page = document.querySelector('[id$="-booking"]');
    for (const text of ['Aarav Mehta', 'Anaya Mehta', 'Booking Confirmation', 'Confirmation Details']) expect(page).toHaveTextContent(text);
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

  it('puts the additional services and the important notes of the booking on the last page, under "General Policy", above the standard terms', () => {
    const base = confirmation().quote;
    const lists = { importantNotes: ['Standard term one.'], paymentPolicy: ['25% advance.'], exclusions: ['Airfare unless specified'] };
    const { container } = view(confirmation({ quote: { ...base, ...lists }, additionalServices: '<p>Airport <strong>transfer</strong></p><p>Candle-light dinner</p>', importantNotes: '<ul><li>Carry a passport</li><li>Be early</li></ul>' }));
    const pages = [...container.querySelectorAll('.quotation-page')];
    const last = pages[pages.length - 1];
    expect(last.id).toMatch(/-page-terms$/); // the last page
    expect(last).toHaveTextContent('GENERAL POLICY');
    const text = last.textContent;
    const order = ['ADDITIONAL SERVICES', 'Airport transfer', 'Candle-light dinner', 'IMPORTANT NOTES', 'Carry a passport', 'Be early', 'TERMS', 'Standard term one.', 'POLICIES', '25% advance.', 'EXCLUSIONS'].map((t) => text.indexOf(t));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // in this order
    expect([...last.querySelectorAll('strong')].some((el) => el.textContent === 'transfer')).toBe(true); // the formatting is kept
    expect(pages[0]).not.toHaveTextContent('ADDITIONAL SERVICES'); // not on the booking page
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
