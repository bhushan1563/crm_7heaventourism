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
    const { container } = view(confirmation());
    const pages = [...container.querySelectorAll('.quotation-page')];
    expect(pages[0].id).toMatch(/-booking$/);
    expect(pages.length).toBeGreaterThanOrEqual(3); // booking page, itinerary, package/price
    expect(pages[0]).toHaveTextContent('Booking Confirmation');
    expect(container).toHaveTextContent('Arrival in Jaipur');
    expect(container).toHaveTextContent('Rs 60,000 Per person');
    expect(container.querySelector('.quotation-doc-container > .quotation-page:first-child')).toBe(pages[0]); // the booking page is the first page, as the print rules expect
    for (const p of pages) expect(p).toHaveTextContent('Ref: 7H-CF-2026-001');
  });

  it('shows who and where, the travellers, the payment, the additional details and the notes', () => {
    view(confirmation());
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

  it('says "Fully paid" once everything is received, and leaves out empty sections', () => {
    view(confirmation({ travellers: [], customFields: [], notes: '', payment: { totalAmount: 5000, received: 5000, balanceDueDate: null, note: '' }, optionName: '' }));
    const page = document.querySelector('[id$="-booking"]');
    expect(page).toHaveTextContent('Fully paid');
    expect(page).not.toHaveTextContent('Balance due by');
    for (const heading of ['Travellers', 'Additional Details', 'Notes']) expect(page).not.toHaveTextContent(heading);
    expect(page).not.toHaveTextContent('Hotel option');
  });

  it('prints what is on the screen (unsaved edits) rather than only what was saved', () => {
    const c = confirmation();
    const form = { travelDate: '2027-05-01', travellers: [{ name: 'Only Edited Name', age: '', passportNo: '', notes: '' }], payment: { totalAmount: 10000, received: 1000, balanceDueDate: '', note: '' }, notes: '', customFields: [] };
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
