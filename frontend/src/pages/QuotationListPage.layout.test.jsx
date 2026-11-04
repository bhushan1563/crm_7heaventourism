import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

// The layout of the quotation list: the action icons keep eight fixed places, so every row lines up whichever buttons it has.

const h = vi.hoisted(() => ({ rights: { create: true, delete: true, download: true }, editable: (q) => q.sales !== 'Colleague' }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'me' }, can: (m, a) => (a === 'canCreate' ? h.rights.create : a === 'canDelete' ? h.rights.delete : a === 'canDownload' ? h.rights.download : true), canEditRecord: (m, q) => h.editable(q) }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../services/quotationService', () => ({ default: { getQuotations: vi.fn(), getStats: vi.fn(), deleteQuotation: vi.fn(), duplicateQuotation: vi.fn(), updateQuotation: vi.fn() } }));
vi.mock('../services/confirmationService', () => ({ default: { confirm: vi.fn() } }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../components/ExportButton', () => ({ default: () => null }));
vi.mock('../components/QuotationPreviewModal', () => ({ default: () => null }));
vi.mock('../components/QuotationDocumentView', () => ({ default: () => null }));
vi.mock('../components/confirmation/ConfirmBookingDialog', () => ({ default: () => null }));
vi.mock('../utils/quotationPdfGenerator', () => ({ generateQuotationPDF: vi.fn() }));

import quotationService from '../services/quotationService';
import QuotationListPage from './QuotationListPage';

const quote = (n, over = {}) => ({ _id: `q${n}`, quotationNo: `7H-QT-2026-00${n}`, quotationType: 'Package', status: 'Draft', clientName: `Client ${n}`, paxDetails: '2 Adults', destination: 'Bali', duration: '5N', travelDate: '2027-03-21', pricing: { totalCostPerPerson: 20000, grandTotal: 40000 }, sales: 'Me', ops: 'Ops', createdAt: '2026-11-01T10:00:00.000Z', ...over });
const rowsOf = () => [...document.querySelectorAll('tbody tr')];
const slotsOf = (row) => [...row.querySelectorAll('.ql-actions > .ql-slot')];
const show = () => render(<MemoryRouter><QuotationListPage /></MemoryRouter>);
const confirmed = (n) => quote(n, { confirmationId: 'c1', confirmationNo: '7H-CF-2026-001', status: 'Confirmed' });

beforeEach(() => {
  h.rights = { create: true, delete: true, download: true };
  h.editable = (q) => q.sales !== 'Colleague';
  quotationService.getQuotations.mockReset();
  quotationService.getStats.mockReset().mockResolvedValue({ success: true, data: { total: 0, confirmed: 0, drafts: 0, pipeline: 0 } });
});
afterEach(cleanup);

describe('the action icons of the quotation list', () => {
  it('give every row the same eight places, in the same order, whatever the row is', async () => {
    quotationService.getQuotations.mockResolvedValue({
      success: true,
      data: [
        quote(1), // an ordinary draft: every button
        confirmed(2), // confirmed: locked, nothing to edit or delete
        quote(3, { sales: 'Colleague' }), // a colleague's quotation: no follow-up, edit or delete
        quote(4, { quotationType: 'Visa' })
      ]
    });
    show();
    await screen.findByText('7H-QT-2026-001');
    const rows = rowsOf();
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(slotsOf(row)).toHaveLength(8);

    const titles = (row) => slotsOf(row).map((slot) => slot.querySelector('[title]')?.getAttribute('title') || '');
    // 1 follow-up, 2 preview, 3 PDF download, 3b Word download, 4 duplicate, 5 confirm, 6 edit (or lock), 7 delete
    expect(titles(rows[0])).toEqual(['Mark for Follow up', expect.stringMatching(/Preview/), 'Direct Download Branded PDF', 'Download Word (.docx)', 'Duplicate as New Draft', expect.stringMatching(/Confirm booking/), 'Edit Itinerary & Pricing', 'Delete Quotation']);
    expect(titles(rows[1])).toEqual(['Mark for Follow up', expect.stringMatching(/Preview/), 'Direct Download Branded PDF', 'Download Word (.docx)', 'Duplicate as New Draft', expect.stringMatching(/Open booking 7H-CF-2026-001/), expect.stringMatching(/Confirmed as 7H-CF-2026-001: locked/), '']);
    expect(titles(rows[2])).toEqual(['', expect.stringMatching(/Preview/), 'Direct Download Branded PDF', 'Download Word (.docx)', 'Duplicate as New Draft', '', 'Locked for Assigned Staff', '']);
  });

  it('keep the place of a button the person has no right to empty, rather than closing the gap', async () => {
    h.rights = { create: false, delete: false, download: false };
    quotationService.getQuotations.mockResolvedValue({ success: true, data: [quote(1), confirmed(2)] });
    show();
    await screen.findByText('7H-QT-2026-001');
    for (const row of rowsOf()) expect(slotsOf(row)).toHaveLength(8);
    const first = slotsOf(rowsOf()[0]);
    expect(first[2].querySelector('button')).toBeNull(); // no PDF download (slot 3)
    expect(first[3].querySelector('button')).toBeNull(); // no Word download (slot 3b)
    expect(first[4].querySelector('button')).toBeNull(); // no duplicate (slot 4)
    expect(first[7].querySelector('button')).toBeNull(); // no delete (slot 7)
    expect(first[6].querySelector('button')).not.toBeNull(); // edit is still in its own place, the seventh
    expect(first[1].querySelector('button')).not.toBeNull(); // preview is still the second
  });

  it('sit under a header of eight columns with fixed widths, so the table fits a laptop without sideways scrolling', async () => {
    quotationService.getQuotations.mockResolvedValue({ success: true, data: [quote(1)] });
    show();
    await screen.findByText('7H-QT-2026-001');
    const table = document.querySelector('table.ql-table');
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll('colgroup col')].map((c) => c.className)).toEqual(['ql-col-no', 'ql-col-client', 'ql-col-dest', 'ql-col-date', 'ql-col-price', 'ql-col-team', 'ql-col-status', 'ql-col-actions']);
    expect(table.querySelectorAll('thead th')).toHaveLength(8);
    expect(within(table).getByText('Actions')).toBeInTheDocument();
  });

  it('show the full text of a long name when the mouse rests on it', async () => {
    quotationService.getQuotations.mockResolvedValue({ success: true, data: [quote(1, { clientName: 'A Very Long Client Name Indeed', destination: 'UNITED ARAB EMIRATES TOURIST VISA', sales: 'Bhushan Doshi', ops: 'Jigisha Patel' })] });
    show();
    await screen.findByText('7H-QT-2026-001');
    expect(screen.getByTitle('A Very Long Client Name Indeed')).toBeInTheDocument();
    expect(screen.getByTitle('UNITED ARAB EMIRATES TOURIST VISA')).toBeInTheDocument();
    expect(screen.getByTitle('Sales: Bhushan Doshi')).toBeInTheDocument();
    expect(screen.getByTitle('Ops: Jigisha Patel')).toBeInTheDocument();
  });

  it('are still eight when a quotation becomes confirmed after a refresh', async () => {
    quotationService.getQuotations.mockResolvedValue({ success: true, data: [quote(1)] });
    show();
    await screen.findByText('7H-QT-2026-001');
    expect(slotsOf(rowsOf()[0])).toHaveLength(8);
    cleanup();
    quotationService.getQuotations.mockResolvedValue({ success: true, data: [confirmed(1)] });
    show();
    await waitFor(() => expect(screen.getByTitle(/Confirmed as 7H-CF-2026-001: locked/)).toBeInTheDocument());
    expect(slotsOf(rowsOf()[0])).toHaveLength(8);
  });
});
