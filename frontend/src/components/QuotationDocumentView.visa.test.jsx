import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';
import { formatDate } from '../utils/dateHelper';

afterEach(cleanup);

const visaQuotation = (over = {}) => ({
  quotationNo: '7H-QT-0042',
  quotationType: 'Visa',
  clientName: 'Aarav Mehta',
  paxDetails: '3 Adults',
  destination: 'UNITED ARAB EMIRATES TOURIST VISA',
  visa: { country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 to 5 working days', applicants: 3, priceNote: 'Embassy fees may change' },
  visaFees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }],
  visaDocuments: ['Passport valid for 6 months', '<p><strong>Passport-size photographs</strong></p>'],
  visaInclusions: ['Form filling'],
  itinerary: [{ dayNumber: 'Day 01', title: 'SHOULD NOT SHOW', description: 'left over from another type' }],
  vehicleNotes: ['VEHICLE RULE SHOULD NOT SHOW'],
  flightDetails: [{ airline: 'LEFTOVER AIR' }],
  pricing: { grandTotal: 20300, totalCostPerPerson: 0, totalCostNote: 'Rs 20,300 total', items: [] },
  exclusions: ['Travel insurance'],
  ...over
});
const view = (q) => render(<MemoryRouter><QuotationDocumentView quotation={q} /></MemoryRouter>);

describe('the visa quotation document', () => {
  it('shows the visa, the documents checklist, the fee table with its total, the note and the inclusions', () => {
    const { container } = view(visaQuotation());
    expect(screen.getByText('Visa Details, Documents & Fees: -')).toBeInTheDocument();
    for (const text of ['United Arab Emirates', 'Tourist', 'Single entry', 'e-Visa', '3 to 5 working days', '60 days', '30 days']) expect(container).toHaveTextContent(text);
    expect(screen.getByText('Documents Required')).toBeInTheDocument();
    expect(screen.getByText('Passport valid for 6 months')).toBeInTheDocument();
    expect(screen.getByText('Passport-size photographs').closest('strong')).not.toBeNull(); // formatting kept
    expect(container).toHaveTextContent('Per applicant × 3');
    expect(container).toHaveTextContent('Whole group');
    expect(container).toHaveTextContent('Rs 19,500'); // 3 x 6,500
    const total = screen.getByText('Total for 3 applicants').parentElement;
    expect(total).toHaveTextContent('Rs 20,300');
    expect(container).toHaveTextContent('Note: Embassy fees may change');
    expect(screen.getByText('Visa Inclusions')).toBeInTheDocument();
    expect(screen.getByText('Form filling')).toBeInTheDocument();
  });

  it('has no itinerary page, no flights page, no vehicle guidelines and no per-person pricing block', () => {
    const { container } = view(visaQuotation());
    expect(container).not.toHaveTextContent('SHOULD NOT SHOW');
    expect(container).not.toHaveTextContent('LEFTOVER AIR');
    expect(container).not.toHaveTextContent('VEHICLE RULE');
    expect(screen.queryByText('ITINERARY')).toBeNull();
    expect(screen.queryByText(/Pricing Breakdown/)).toBeNull();
    expect(container.querySelector('[id$="-page-1"]')).toBeNull();
    expect(container.querySelector('[id$="-page-2"]')).not.toBeNull();
  });

  it('prints no terms, policies or exclusions page: the client does not want them on a visa quotation', () => {
    const { container } = view(visaQuotation({ importantNotes: ['Fees are not refundable'], paymentPolicy: ['100% advance'], cancellationPolicy: ['No refund after submission'] }));
    for (const gone of ['TERMS, POLICIES, EXCLUSIONS', 'Payment Policy', 'Cancellation Policy', 'Fees are not refundable', '100% advance', 'No refund after submission', 'Travel insurance', 'Exclusions']) expect(container, gone).not.toHaveTextContent(gone);
    expect(container.querySelector('[id$="-page-terms"]')).toBeNull();
    expect(container).toHaveTextContent('Documents'); // the visa's own pages are still there
  });

  it('uses the singular for one applicant and says "On request" before any fee has an amount', () => {
    view(visaQuotation({ visa: { country: 'France', applicants: 1 }, visaFees: [{ label: 'Visa fee', amount: 0, per: 'applicant' }] }));
    const total = screen.getByText('Total for 1 applicant').parentElement;
    expect(within(total).getByText('On request')).toBeInTheDocument();
  });

  it('shows plain text exactly as typed, never as markup', () => {
    const { container } = view(visaQuotation({ visaDocuments: ['<b>not bold</b> & <script>x</script>'] }));
    expect(container).toHaveTextContent('<b>not bold</b> & <script>x</script>');
    expect(container.querySelector('script')).toBeNull();
  });

  describe('the applicant and trip details', () => {
    const trip = () => screen.getByTestId('visa-trip-details');
    const typed = { clientName: 'Meera Iyer', paxDetails: '2 Adults + 1 Child', travelDate: '2027-03-15', duration: '7 Nights / 8 Days', validUntil: '2027-01-31' };

    it('prints the client, the guests, the travel date, the duration and how long the offer holds', () => {
      view(visaQuotation(typed));
      for (const [label, value] of [['Client', 'Meera Iyer'], ['Travellers', '2 Adults + 1 Child'], ['Travel date', formatDate('2027-03-15')], ['Duration', '7 Nights / 8 Days'], ['Quotation valid until', formatDate('2027-01-31')]]) {
        expect(within(trip()).getByText(`${label}:`).parentElement).toHaveTextContent(value);
      }
      expect(formatDate('2027-03-15')).not.toBe('');
    });

    it('comes before the visa facts, so the page starts with who it is for', () => {
      view(visaQuotation(typed));
      const facts = screen.getByText('Visa type:').closest('div').parentElement;
      expect(trip().compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('leaves out whatever was not typed, and the box itself when nothing was', () => {
      view(visaQuotation({ clientName: '', paxDetails: '', travelDate: '2027-03-15', duration: '', validUntil: '' }));
      expect(within(trip()).queryByText('Duration:')).toBeNull();
      expect(within(trip()).queryByText('Client:')).toBeNull();
      expect(within(trip()).getByText('Travel date:')).toBeInTheDocument();
      cleanup();
      view(visaQuotation({ clientName: '', paxDetails: '', travelDate: '', duration: '', validUntil: '' }));
      expect(screen.queryByTestId('visa-trip-details')).toBeNull();
    });

    it('shows typed text as text only: markup in a field is never run', () => {
      const { container } = view(visaQuotation({ ...typed, clientName: '<img src=x onerror="window.__pwned=1">Meera', duration: '<script>window.__pwned=1</script>7 Nights' }));
      expect(container.querySelector('[data-testid="visa-trip-details"] img')).toBeNull();
      expect(container.querySelector('[data-testid="visa-trip-details"] script')).toBeNull();
      expect(trip()).toHaveTextContent('<img src=x onerror="window.__pwned=1">Meera');
      expect(window.__pwned).toBeUndefined();
    });

    it('is only for visa quotations', () => {
      view(visaQuotation({ ...typed, quotationType: 'Package' }));
      expect(screen.queryByTestId('visa-trip-details')).toBeNull();
    });
  });

  it('leaves other quotation types as they were: itinerary page, no visa section', () => {
    const { container } = view(visaQuotation({ quotationType: 'Package', packageDetails: { inclusions: ['Daily breakfast'] } }));
    expect(container).toHaveTextContent('SHOULD NOT SHOW');
    expect(screen.queryByText('Documents Required')).toBeNull();
    expect(container.querySelector('[id$="-page-1"]')).not.toBeNull();
  });
});
