import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ canDownload: true }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (module, action) => (action === 'canDownload' ? h.canDownload : true) }) }));

import QuotationPreviewModal from './QuotationPreviewModal';
import ConfirmationPreview from './confirmation/ConfirmationPreview';

afterEach(cleanup);

const quotation = { quotationNo: '7H-QT-2026-001', quotationType: 'Package', clientName: 'Aarav', destination: 'GOA', paxDetails: '2 Adults', itinerary: [], packageDetails: { hotels: [], inclusions: [] }, pricing: {} };
const open = (props = {}) => render(<MemoryRouter><QuotationPreviewModal isOpen onClose={() => {}} quotation={quotation} {...props} /></MemoryRouter>);

describe('the preview window and the Download right', () => {
  it('offers Print and Download PDF to someone who has the right (and by default)', () => {
    open();
    expect(screen.getByRole('button', { name: /Download PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print/ })).toBeInTheDocument();
    expect(screen.queryByText(/you do not have the Download right/i)).toBeNull();
  });

  it('shows the document but offers neither Print nor Download PDF without the right, and says why', () => {
    open({ canDownload: false });
    expect(screen.queryByRole('button', { name: /Download PDF/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Print/ })).toBeNull();
    expect(screen.getByText(/Viewing only: you do not have the Download right/)).toBeInTheDocument();
    expect(screen.getAllByText('GOA').length).toBeGreaterThan(0); // the document itself is still readable
    expect(screen.getByRole('button', { name: /Close Preview/ })).toBeInTheDocument();
  });

  it('a booking confirmation follows the Download right of the confirmations module', () => {
    const confirmation = { _id: 'c1', confirmationNo: '7H-CF-2026-001', quotationNo: '7H-QT-2026-001', clientName: 'Aarav', destination: 'GOA', status: 'Confirmed', travellers: [], payment: { totalAmount: 1, received: 0 }, customFields: [], quote: quotation };
    h.canDownload = true;
    const { rerender } = render(<MemoryRouter><ConfirmationPreview confirmation={confirmation} isOpen onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Download PDF/ })).toBeInTheDocument();
    h.canDownload = false;
    rerender(<MemoryRouter><ConfirmationPreview confirmation={confirmation} isOpen onClose={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Download PDF/ })).toBeNull();
    expect(screen.getByText(/Viewing only/)).toBeInTheDocument();
    h.canDownload = true;
  });
});
