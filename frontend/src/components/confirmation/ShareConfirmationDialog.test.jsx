import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const files = vi.hoisted(() => ({ host: null, pdf: vi.fn(), docx: vi.fn() }));
vi.mock('../../hooks/useQuotationFiles', () => ({ default: () => files }));
vi.mock('../../utils/download', () => ({ saveBlob: vi.fn() }));
vi.mock('../../services/confirmationService', () => ({ default: { get: vi.fn(), update: vi.fn() } }));

import confirmationService from '../../services/confirmationService';
import { saveBlob } from '../../utils/download';
import { formatDate } from '../../utils/dateHelper';
import ShareConfirmationDialog from './ShareConfirmationDialog';

const summary = (over = {}) => ({ _id: 'c1', confirmationNo: '7H-CF-2026-001', quotationNo: '7H-QT-2026-022', clientName: 'Pujan', clientPhone: '', clientEmail: '', destination: 'Vietnam', paxDetails: '6 Adults', travelDate: '2027-03-21T00:00:00.000Z', status: 'Confirmed', updatedAt: '2026-11-03T08:00:00.000Z', ...over });
const whole = (over = {}) => ({ ...summary(), quote: { quotationType: 'Package', destination: 'Vietnam', clientName: 'Pujan', quotationNo: '7H-QT-2026-022' }, payment: { totalAmount: 757200, received: 0 }, travellers: [], customFields: [], ...over });
const pdfFile = { blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), filename: '7Heaven_Confirmation_Vietnam_7H-CF-2026-001.pdf' };
const show = (props = {}) => render(<ShareConfirmationDialog confirmation={summary()} isOpen onClose={() => {}} canEdit senderName="Sana Tester" senderNumber="+919876543210" {...props} />);
const phoneField = () => screen.getByLabelText('WhatsApp number');
const emailField = () => screen.getByLabelText('E-mail address');
const whatsapp = () => screen.getByRole('button', { name: /Send on WhatsApp/ });
const mail = () => screen.getByRole('button', { name: /Send by e-mail/ });

let popup;
let mailLinks;
const realClick = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  files.pdf.mockReset().mockResolvedValue(pdfFile);
  files.docx.mockReset();
  saveBlob.mockReset();
  confirmationService.get.mockReset().mockResolvedValue({ success: true, data: whole() });
  confirmationService.update.mockReset().mockResolvedValue({ success: true, data: { updatedAt: '2026-11-04T09:00:00.000Z', clientPhone: '+91 98765 43210' } });
  popup = { closed: false, location: { href: '' }, document: { write: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, 'open').mockImplementation(() => popup);
  mailLinks = [];
  HTMLAnchorElement.prototype.click = function click() {
    if (this.href.startsWith('mailto:')) mailLinks.push(this.href);
    else realClick.call(this);
  };
  delete navigator.canShare;
  delete navigator.share;
});
afterEach(() => {
  cleanup();
  HTMLAnchorElement.prototype.click = realClick;
  vi.restoreAllMocks();
});

describe('the window for a booking confirmation', () => {
  it('says which booking it is, writes the message for this booking and signs it with the sender\'s name and number', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Share this booking confirmation' })).toBeInTheDocument();
    expect(screen.getByText('7H-CF-2026-001 · Pujan · Vietnam')).toBeInTheDocument();
    const text = screen.getByLabelText('Message').value;
    expect(text).toMatch(/^Hello Pujan,/);
    expect(text).toContain('Your booking 7H-CF-2026-001 for Vietnam is confirmed');
    expect(text).toContain(`Travel date: ${formatDate('2027-03-21T00:00:00.000Z')}`);
    expect(text).toContain('Travellers: 6 Adults');
    expect(text.endsWith('Sana Tester\n+919876543210')).toBe(true);
    expect(screen.getByLabelText('Subject').value).toBe('7Heaven Tourism: Booking confirmation 7H-CF-2026-001 for Vietnam');
  });

  it('is a PDF only: Word is not offered for a booking', () => {
    show();
    expect(screen.getByRole('radio', { name: /^PDF ready to read/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Word/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Word/ })).toHaveTextContent('PDF only');
  });

  it('shows the sender\'s own number, or says the company number is used and who can set theirs', () => {
    const { unmount } = show();
    expect(screen.getByTestId('share-from')).toHaveTextContent('Your number in the message: +91 98765 43210');
    unmount();
    show({ senderNumber: '' });
    expect(screen.getByTestId('share-from')).toHaveTextContent('The message carries the company number (+91 7862829178). An Admin can set your own number in Rights & Security.');
  });

  it('closes the message with the company number when the sender has none', () => {
    show({ senderNumber: '' });
    expect(screen.getByLabelText('Message').value.endsWith('Sana Tester\n+91 7862829178')).toBe(true);
  });
});

describe('making and sending the PDF', () => {
  it('fetches the whole booking (the list only has a summary), draws the booking page in front of the quotation, and names the file after the booking', async () => {
    show({ confirmation: summary({ clientPhone: '+91 98765 43210' }) });
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/));
    expect(confirmationService.get).toHaveBeenCalledWith('c1');
    expect(files.pdf).toHaveBeenCalledTimes(1);
    const [quotation, options] = files.pdf.mock.calls[0];
    expect(quotation).toMatchObject({ destination: 'Vietnam', quotationNo: '7H-CF-2026-001' }); // the quotation as sold, numbered as the booking
    expect(typeof options.before).toBe('function');
    expect(options.filename).toBe('7Heaven_Confirmation_Vietnam_7H-CF-2026-001.pdf');
    expect(saveBlob).toHaveBeenCalledWith(pdfFile.blob, pdfFile.filename);
    expect(decodeURIComponent(popup.location.href.split('?text=')[1])).toBe(screen.getByLabelText('Message').value);
  });

  it('does not fetch again when it already has the whole booking, nor a second time for the same booking', async () => {
    const { unmount } = show({ confirmation: whole({ clientPhone: '9876543210' }) });
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    expect(confirmationService.get).not.toHaveBeenCalled();
    unmount();
    show({ confirmation: summary({ clientPhone: '9876543210' }) });
    await userEvent.click(whatsapp());
    await waitFor(() => expect(files.pdf).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: /Only download the PDF/ }));
    await waitFor(() => expect(files.pdf).toHaveBeenCalledTimes(3));
    expect(confirmationService.get).toHaveBeenCalledTimes(1);
  });

  it('with no number it asks for one in plain words and prepares nothing', async () => {
    show();
    expect(screen.getByRole('note')).toHaveTextContent('No WhatsApp number is saved for this client. Enter it to send on WhatsApp.');
    await userEvent.click(whatsapp());
    expect(screen.getByRole('alert')).toHaveTextContent("Enter the client's WhatsApp number");
    expect(phoneField()).toHaveFocus();
    expect(files.pdf).not.toHaveBeenCalled();
    expect(confirmationService.get).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('sends by e-mail with the booking\'s subject and message', async () => {
    show({ confirmation: summary({ clientEmail: 'pujan@example.com' }) });
    await userEvent.click(mail());
    await waitFor(() => expect(mailLinks).toHaveLength(1));
    const params = new URLSearchParams(mailLinks[0].split('?')[1]);
    expect(mailLinks[0].startsWith('mailto:pujan@example.com?')).toBe(true);
    expect(params.get('subject')).toBe('7Heaven Tourism: Booking confirmation 7H-CF-2026-001 for Vietnam');
    expect(params.get('body')).toBe(screen.getByLabelText('Message').value);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('attach it to the e-mail before sending'));
  });

  it('says what the server said when the booking cannot be opened, and closes the empty WhatsApp window', async () => {
    confirmationService.get.mockResolvedValue({ success: false, message: 'Confirmation not found.' });
    show({ confirmation: summary({ clientPhone: '9876543210' }) });
    await userEvent.click(whatsapp());
    expect(await screen.findByText('Confirmation not found.')).toBeInTheDocument();
    expect(popup.close).toHaveBeenCalled();
    expect(files.pdf).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

describe('keeping the contact on the booking', () => {
  it('keeps a typed number on the booking, with the version of the booking it saw, and hands back the new version', async () => {
    const onContactSaved = vi.fn();
    show({ onContactSaved });
    await userEvent.type(phoneField(), '98765 43210');
    expect(screen.getByRole('checkbox', { name: /Keep these contact details on the booking/ })).toBeChecked();
    await userEvent.click(whatsapp());
    await waitFor(() => expect(confirmationService.update).toHaveBeenCalledWith('c1', { clientPhone: '+91 98765 43210', updatedAt: '2026-11-03T08:00:00.000Z' }));
    expect(onContactSaved).toHaveBeenCalledWith({ clientPhone: '+91 98765 43210' }, expect.objectContaining({ updatedAt: '2026-11-04T09:00:00.000Z' }));
  });

  it('keeps an e-mail address too', async () => {
    show();
    await userEvent.type(emailField(), 'pujan@example.com');
    await userEvent.click(mail());
    await waitFor(() => expect(confirmationService.update).toHaveBeenCalledWith('c1', { clientEmail: 'pujan@example.com', updatedAt: '2026-11-03T08:00:00.000Z' }));
  });

  it('does not offer to keep it where the person may not change the booking, and sends all the same', async () => {
    show({ canEdit: false });
    await userEvent.type(phoneField(), '9876543210');
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    expect(confirmationService.update).not.toHaveBeenCalled();
  });

  it('still opens WhatsApp when the number could not be kept (for example the booking was changed meanwhile), and says so', async () => {
    confirmationService.update.mockResolvedValue({ success: false, message: 'This confirmation was changed by Omar Tester while you were editing it. Please reload to see their changes before saving.' });
    show();
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('could not be saved on the booking: This confirmation was changed by Omar Tester'));
  });
});
