import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  showToast: vi.fn(),
  navigate: vi.fn(),
  perms: { create: true, download: true, editRecord: true },
  files: { host: null, working: false, pdf: vi.fn(), docx: vi.fn() }
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { firstName: 'Sana', lastName: 'Tester' },
    can: (m, a) => (a === 'canCreate' ? h.perms.create : a === 'canDownload' ? h.perms.download : true),
    canEditRecord: () => h.perms.editRecord
  })
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => h.navigate }));
vi.mock('../../services/quotationService', () => ({ default: { getQuotations: vi.fn() } }));
vi.mock('../../hooks/useQuotationFiles', () => ({ default: () => h.files }));
vi.mock('../../utils/download', () => ({ saveBlob: vi.fn() }));
vi.mock('../QuotationPreviewModal', () => ({ default: ({ quotation, canDownload, onClose, onShare }) => <div role="dialog" aria-label="Preview">{quotation.quotationNo} download:{String(canDownload)}<button onClick={onClose}>Close preview</button>{onShare && <button onClick={() => onShare(quotation)}>Send from preview</button>}</div> }));
vi.mock('../quotation/ShareQuotationDialog', () => ({
  default: ({ quotation, canEdit, senderName, onContactSaved, onClose }) => (
    <div role="dialog" aria-label="Share">
      {quotation.quotationNo} edit:{String(canEdit)} sender:{senderName}
      <button onClick={() => onContactSaved({ clientPhone: '+91 98765 43210' })}>Pretend the number was saved</button>
      <button onClick={onClose}>Close share</button>
    </div>
  )
}));

import quotationService from '../../services/quotationService';
import { saveBlob } from '../../utils/download';
import ClientVisasPanel, { priceOf } from './ClientVisasPanel';
import { formatDate } from '../../utils/dateHelper';

const visaQuote = (n, over = {}) => ({
  _id: `q${n}`,
  quotationNo: `7H-QT-00${n}`,
  quotationType: 'Visa',
  status: 'Draft',
  clientName: `Client ${n}`,
  clientPhone: '+91 90000 0000' + n,
  clientEmail: '',
  destination: `COUNTRY ${n} TOURIST VISA`,
  duration: '7 Nights / 8 Days',
  travelDate: '2027-03-15',
  paxDetails: '2 Adults',
  createdAt: '2026-11-01T10:00:00.000Z',
  visa: { country: `Country ${n}`, visaType: 'Tourist', entryType: 'Single entry', applicants: 2 },
  visaFees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }],
  pricing: { grandTotal: 13800 },
  ...over
});
const reply = (data) => ({ success: true, count: data.length, data });
const show = () => render(<MemoryRouter><ClientVisasPanel /></MemoryRouter>);

beforeEach(() => {
  quotationService.getQuotations.mockReset();
  saveBlob.mockReset();
  h.showToast.mockReset();
  h.navigate.mockReset();
  h.files.pdf.mockReset().mockResolvedValue({ filename: 'x.pdf' });
  h.files.docx.mockReset().mockResolvedValue({ blob: new Blob(['PK']), filename: 'x.docx' });
  h.files.working = false;
  h.perms = { create: true, download: true, editRecord: true };
});
afterEach(cleanup);

describe('listing', () => {
  it('asks for the visa quotations only, and lists each with its client, visa, trip and fees', async () => {
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1), visaQuote(2, { clientPhone: '', clientEmail: 'two@example.com', duration: '', travelDate: '', paxDetails: '' })]));
    show();
    expect(await screen.findByText('7H-QT-001')).toBeInTheDocument();
    expect(quotationService.getQuotations).toHaveBeenCalledWith({ quotationType: 'Visa' });
    expect(screen.getByText('2 visa quotations')).toBeInTheDocument();
    const first = screen.getByText('7H-QT-001').closest('tr');
    expect(within(first).getByText('Client 1')).toBeInTheDocument();
    expect(within(first).getByText('+91 90000 00001')).toBeInTheDocument();
    expect(within(first).getByText('COUNTRY 1 TOURIST VISA')).toBeInTheDocument();
    expect(within(first).getByText('Country 1 · Tourist · Single entry')).toBeInTheDocument();
    expect(within(first).getByText(`7 Nights / 8 Days · Travel ${formatDate('2027-03-15')}`)).toBeInTheDocument();
    expect(within(first).getByText('2 Adults')).toBeInTheDocument();
    expect(within(first).getByText('Rs 13,800')).toBeInTheDocument(); // 2 x 6,500 + 800
    expect(within(first).getByText('2 applicants')).toBeInTheDocument();
    const second = screen.getByText('7H-QT-002').closest('tr');
    expect(within(second).getByText('No WhatsApp number yet')).toBeInTheDocument();
    expect(within(second).getByText('two@example.com')).toBeInTheDocument();
    expect(within(second).getByText('Guests not set')).toBeInTheDocument();
  });

  it('works out the fees from the fee lines, and falls back to the saved total', () => {
    expect(priceOf(visaQuote(1))).toBe(13800);
    expect(priceOf(visaQuote(1, { visaFees: [], pricing: { grandTotal: 5000 } }))).toBe(5000);
    expect(priceOf({ visaFees: [], visa: {}, pricing: {} })).toBe(0);
  });

  it('says plainly when there are none yet, and offers to make the first', async () => {
    quotationService.getQuotations.mockResolvedValue(reply([]));
    show();
    expect(await screen.findByText('No visa quotations yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Make the first visa quotation/ }));
    expect(h.navigate).toHaveBeenCalledWith('/quotations/new?type=Visa');
  });

  it('shows a problem in words, with a way to try again', async () => {
    quotationService.getQuotations.mockRejectedValueOnce(new Error('boom'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('The visa quotations could not be loaded.');
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1)]));
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('7H-QT-001')).toBeInTheDocument();
  });

  it('shows a business message from the server as it is', async () => {
    quotationService.getQuotations.mockResolvedValue({ success: false, message: 'You do not have permission to see quotations.' });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to see quotations.');
  });
});

describe('finding a visa quotation', () => {
  it('searches by destination once the typing pauses, and says when nothing matches', async () => {
    quotationService.getQuotations.mockResolvedValueOnce(reply([visaQuote(1), visaQuote(2)]));
    show();
    await screen.findByText('7H-QT-001');
    quotationService.getQuotations.mockResolvedValue(reply([]));
    await userEvent.type(screen.getByLabelText('Search visa quotations'), 'atlantis');
    await waitFor(() => expect(quotationService.getQuotations).toHaveBeenLastCalledWith({ quotationType: 'Visa', search: 'atlantis' }));
    expect(quotationService.getQuotations.mock.calls.length).toBe(2); // one search, not one per letter
    expect(await screen.findByText('No visa quotations match')).toBeInTheDocument();
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1)]));
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('7H-QT-001')).toBeInTheDocument();
    expect(screen.getByLabelText('Search visa quotations')).toHaveValue('');
  });

  it('filters by status', async () => {
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1)]));
    show();
    await screen.findByText('7H-QT-001');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Sent');
    await waitFor(() => expect(quotationService.getQuotations).toHaveBeenLastCalledWith({ quotationType: 'Visa', status: 'Sent' }));
  });

  it('shows 20 at a time with page buttons', async () => {
    quotationService.getQuotations.mockResolvedValue(reply(Array.from({ length: 45 }, (_, i) => visaQuote(i + 1))));
    show();
    await screen.findByText('Page 1 of 3');
    expect(screen.getAllByRole('row')).toHaveLength(21); // header + 20
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('7H-QT-0021')).toBeInTheDocument();
    expect(screen.queryByText('7H-QT-001')).toBeNull();
  });

  it('keeps the page someone is on while they have not searched for anything new', async () => {
    quotationService.getQuotations.mockResolvedValue(reply(Array.from({ length: 45 }, (_, i) => visaQuote(i + 1))));
    show();
    await screen.findByText('Page 1 of 3');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 450)); // longer than the pause before a search is sent
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(quotationService.getQuotations).toHaveBeenCalledTimes(1);
  });

  it('goes back to the first page when the search or the status changes', async () => {
    quotationService.getQuotations.mockResolvedValue(reply(Array.from({ length: 45 }, (_, i) => visaQuote(i + 1))));
    show();
    await screen.findByText('Page 1 of 3');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Sent');
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
  });
});

describe('what can be done with one', () => {
  beforeEach(() => {
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1)]));
  });

  it('starts a new visa quotation', async () => {
    show();
    await screen.findByText('7H-QT-001');
    await userEvent.click(screen.getByRole('button', { name: /New visa quotation/ }));
    expect(h.navigate).toHaveBeenCalledWith('/quotations/new?type=Visa');
  });

  it('opens it to edit in the quotation builder', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit 7H-QT-001' }));
    expect(h.navigate).toHaveBeenCalledWith('/quotations/q1/edit');
  });

  it('shows a confirmed one as locked, without an edit button', async () => {
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1, { confirmationId: 'c1', confirmationNo: 'BK-001' })]));
    show();
    expect(await screen.findByLabelText('7H-QT-001 is confirmed and locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit 7H-QT-001/ })).toBeNull();
  });

  it('lets someone open a colleague\'s quotation but not edit it', async () => {
    h.perms.editRecord = false;
    show();
    expect(await screen.findByRole('button', { name: 'Open 7H-QT-001' })).toBeDisabled();
  });

  it('previews it', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Preview 7H-QT-001' }));
    expect(screen.getByRole('dialog', { name: 'Preview' })).toHaveTextContent('7H-QT-001 download:true');
  });

  it('can be sent straight from the preview: the preview closes and the share window opens for it', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Preview 7H-QT-001' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send from preview' }));
    expect(screen.queryByRole('dialog', { name: 'Preview' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Share' })).toHaveTextContent('7H-QT-001');
  });

  it('downloads the PDF, and says so', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Download the PDF of 7H-QT-001' }));
    await waitFor(() => expect(h.files.pdf).toHaveBeenCalledWith(expect.objectContaining({ _id: 'q1' }), { save: true }));
    expect(h.showToast).toHaveBeenCalledWith('The PDF of 7H-QT-001 was downloaded.', 'success');
  });

  it('downloads the Word file, and says so', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Download the Word file of 7H-QT-001' }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'x.docx'));
    expect(h.showToast).toHaveBeenCalledWith('The Word file of 7H-QT-001 was downloaded.', 'success');
  });

  it('says in words when a file cannot be made, without technical details', async () => {
    h.files.pdf.mockRejectedValue(new Error('html2canvas: null'));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Download the PDF of 7H-QT-001' }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('The PDF could not be prepared. Please try again.', 'error'));
    h.files.docx.mockRejectedValue(Object.assign(new Error('x'), { userMessage: 'Another file is being prepared. Please wait a moment and try again.' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download the Word file of 7H-QT-001' }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('Another file is being prepared. Please wait a moment and try again.', 'error'));
  });

  it('opens the share window for it, which may save contact details only where editing is allowed', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Send 7H-QT-001 to the client' }));
    expect(screen.getByRole('dialog', { name: 'Share' })).toHaveTextContent('7H-QT-001 edit:true sender:Sana Tester');
  });

  it('does not let the share window save details on a quotation that is locked or someone else\'s', async () => {
    h.perms.editRecord = false;
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Send 7H-QT-001 to the client' }));
    expect(screen.getByRole('dialog', { name: 'Share' })).toHaveTextContent('edit:false');
  });

  it('shows a number kept by the share window in the list straight away', async () => {
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1, { clientPhone: '' })]));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Send 7H-QT-001 to the client' }));
    expect(screen.getByText('No WhatsApp number yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pretend the number was saved' }));
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.queryByText('No WhatsApp number yet')).toBeNull();
  });
});

describe('rights', () => {
  it('without the right to create there is no New button', async () => {
    h.perms.create = false;
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1)]));
    show();
    await screen.findByText('7H-QT-001');
    expect(screen.queryByRole('button', { name: /New visa quotation/ })).toBeNull();
  });

  it('without the right to download there is no PDF, Word or Send, but the quotation can still be previewed', async () => {
    h.perms.download = false;
    quotationService.getQuotations.mockResolvedValue(reply([visaQuote(1)]));
    show();
    await screen.findByText('7H-QT-001');
    for (const name of [/Download the PDF/, /Download the Word/, /Send 7H-QT-001/]) expect(screen.queryByRole('button', { name })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Preview 7H-QT-001' }));
    expect(screen.getByRole('dialog', { name: 'Preview' })).toHaveTextContent('download:false');
  });
});
