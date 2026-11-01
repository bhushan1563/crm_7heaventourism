import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuotationDocumentView from './QuotationDocumentView';

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

  it('still prints the exclusions and policies pages of the quotation', () => {
    const { container } = view(visaQuotation());
    expect(container).toHaveTextContent('Travel insurance');
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

  it('leaves other quotation types as they were: itinerary page, no visa section', () => {
    const { container } = view(visaQuotation({ quotationType: 'Package', packageDetails: { inclusions: ['Daily breakfast'] } }));
    expect(container).toHaveTextContent('SHOULD NOT SHOW');
    expect(screen.queryByText('Documents Required')).toBeNull();
    expect(container.querySelector('[id$="-page-1"]')).not.toBeNull();
  });
});
