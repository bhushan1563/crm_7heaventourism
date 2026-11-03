import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const files = vi.hoisted(() => ({ host: null, pdf: vi.fn(), docx: vi.fn() }));
vi.mock('../../hooks/useQuotationFiles', () => ({ default: () => files }));
vi.mock('../../utils/download', () => ({ saveBlob: vi.fn() }));
vi.mock('../../services/quotationService', () => ({ default: { updateQuotation: vi.fn() } }));

import quotationService from '../../services/quotationService';
import { saveBlob } from '../../utils/download';
import ShareQuotationDialog from './ShareQuotationDialog';

const quote = (over = {}) => ({ _id: 'q1', quotationNo: '7H-QT-0042', quotationType: 'Visa', clientName: 'Meera Iyer', destination: 'JAPAN TOURIST VISA', clientPhone: '', clientEmail: '', ...over });
const pdfFile = { blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), filename: '7Heaven_Quotation_JAPAN_TOURIST_VISA_7H-QT-0042.pdf' };
const wordFile = { blob: new Blob(['PK'], { type: 'application/zip' }), filename: '7Heaven_Quotation_JAPAN_TOURIST_VISA_7H-QT-0042.docx' };
const show = (props = {}) => render(<ShareQuotationDialog quotation={quote()} isOpen onClose={() => {}} canEdit senderName="Sana Tester" {...props} />);
const phoneField = () => screen.getByLabelText('WhatsApp number');
const emailField = () => screen.getByLabelText('E-mail address');
const whatsapp = () => screen.getByRole('button', { name: /Send on WhatsApp/ });
const mail = () => screen.getByRole('button', { name: /Send by e-mail/ });

let popup;
let opened;
let mailLinks;
const realClick = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  files.pdf.mockReset().mockResolvedValue(pdfFile);
  files.docx.mockReset().mockResolvedValue(wordFile);
  saveBlob.mockReset();
  quotationService.updateQuotation.mockReset().mockResolvedValue({ success: true });
  popup = { closed: false, location: { href: '' }, document: { write: vi.fn() }, close: vi.fn() };
  opened = vi.spyOn(window, 'open').mockImplementation(() => popup);
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

describe('opening', () => {
  it('says what is being shared and starts with a friendly message for this client, as a PDF', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Share this quotation' })).toBeInTheDocument();
    expect(screen.getByText('7H-QT-0042 · Meera Iyer · JAPAN TOURIST VISA')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /PDF/ })).toHaveAttribute('aria-checked', 'true');
    const text = screen.getByLabelText('Message').value;
    expect(text).toMatch(/^Hello Meera Iyer,/);
    expect(text).toContain('JAPAN TOURIST VISA quotation (7H-QT-0042) attached as a PDF file');
    expect(text).toContain('Sana Tester');
    expect(screen.getByLabelText('Subject').value).toBe('7Heaven Tourism: JAPAN TOURIST VISA quotation 7H-QT-0042');
  });

  it('starts with the number and the address the quotation already has', () => {
    show({ quotation: quote({ clientPhone: '+91 98765 43210', clientEmail: 'meera@example.com' }) });
    expect(phoneField()).toHaveValue('+91 98765 43210');
    expect(emailField()).toHaveValue('meera@example.com');
    expect(screen.queryByText(/No WhatsApp number is saved/)).toBeNull();
  });

  it('says plainly when there is no WhatsApp number, and asks for one', () => {
    show();
    expect(screen.getByRole('note')).toHaveTextContent('No WhatsApp number is saved for this client. Enter it to send on WhatsApp.');
  });

  it('starts afresh when it is opened for another quotation', () => {
    const { rerender } = show({ quotation: quote({ clientPhone: '9876543210' }) });
    expect(phoneField()).toHaveValue('9876543210');
    rerender(<ShareQuotationDialog quotation={quote({ _id: 'q2', clientName: 'Rohan Kulkarni', clientPhone: '' })} isOpen onClose={() => {}} canEdit />);
    expect(phoneField()).toHaveValue('');
    expect(screen.getByLabelText('Message').value).toMatch(/^Hello Rohan Kulkarni,/);
  });
});

describe('WhatsApp', () => {
  it('without a number it asks for one in plain words, puts the cursor there, and prepares nothing', async () => {
    show();
    await userEvent.click(whatsapp());
    expect(screen.getByRole('alert')).toHaveTextContent("Enter the client's WhatsApp number");
    expect(phoneField()).toHaveFocus();
    expect(phoneField()).toHaveAttribute('aria-invalid', 'true');
    expect(files.pdf).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it('explains a wrong number and clears the message once it is being corrected', async () => {
    show();
    await userEvent.type(phoneField(), '98765');
    await userEvent.click(whatsapp());
    expect(screen.getByRole('alert')).toHaveTextContent('too short');
    await userEvent.type(phoneField(), '43210');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('with a number it makes the file, saves it, and opens WhatsApp with that number and the message', async () => {
    show();
    await userEvent.type(phoneField(), '98765 43210');
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/));
    expect(files.pdf).toHaveBeenCalledTimes(1);
    expect(saveBlob).toHaveBeenCalledWith(pdfFile.blob, pdfFile.filename);
    expect(decodeURIComponent(popup.location.href.split('?text=')[1])).toBe(screen.getByLabelText('Message').value);
    const notice = await screen.findByRole('status');
    await waitFor(() => expect(notice).toHaveTextContent('WhatsApp is opening with your message for +91 98765 43210'));
    expect(notice).toHaveTextContent(`The file ${pdfFile.filename} was saved to your computer: attach it in the chat`);
  });

  it('opens the window while the click still counts, before the file is ready', async () => {
    let release;
    files.pdf.mockReturnValue(new Promise((r) => { release = () => r(pdfFile); }));
    show();
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    expect(opened).toHaveBeenCalledTimes(1); // already open, though the file is not ready
    expect(popup.location.href).toBe('');
    expect(screen.getByRole('button', { name: /Preparing the PDF/ })).toBeDisabled(); // nothing can be pressed twice
    expect(screen.getByRole('button', { name: /Send by e-mail/ })).toBeDisabled();
    release();
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    await waitFor(() => expect(whatsapp()).not.toBeDisabled());
  });

  it('when the browser blocks the window it gives a link to open WhatsApp instead, and still saves the file', async () => {
    opened.mockReturnValue(null);
    show();
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    const link = await screen.findByRole('link', { name: 'Open WhatsApp for +91 98765 43210' });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('status')).toHaveTextContent('blocked the WhatsApp window');
    expect(saveBlob).toHaveBeenCalled();
  });

  it('closes the empty window and says what went wrong when the file cannot be made', async () => {
    files.pdf.mockRejectedValue(new Error('html2canvas: Cannot read properties of null'));
    show();
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    expect(await screen.findByText('The file could not be prepared. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/html2canvas/)).toBeNull(); // technical details are not shown to the person
    expect(popup.close).toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(whatsapp()).not.toBeDisabled();
  });

  it('shows a deliberate message as it is, for example when another file is still being prepared', async () => {
    files.pdf.mockRejectedValue(Object.assign(new Error('x'), { userMessage: 'Another file is being prepared. Please wait a moment and try again.' }));
    show();
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    expect(await screen.findByText('Another file is being prepared. Please wait a moment and try again.')).toBeInTheDocument();
  });

  it('sends a number typed with the country code to that country', async () => {
    show();
    await userEvent.type(phoneField(), '+971 50 123 4567');
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/^https:\/\/wa\.me\/971501234567\?text=/));
  });
});

describe('the result', () => {
  it('is brought into view when it appears, since a small window may hide the bottom of the dialog', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      show({ quotation: quote({ clientPhone: '9876543210' }) });
      await userEvent.click(whatsapp());
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('WhatsApp is opening'));
      expect(scroll).toHaveBeenCalled();
      expect(scroll.mock.contexts.some((el) => el.getAttribute('role') === 'status')).toBe(true);
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });
});

describe('e-mail', () => {
  it('asks for an address when there is none, and explains a wrong one', async () => {
    show();
    await userEvent.click(mail());
    expect(screen.getByRole('alert')).toHaveTextContent("Enter the client's e-mail address");
    await userEvent.type(emailField(), 'meera@');
    await userEvent.click(mail());
    expect(screen.getByRole('alert')).toHaveTextContent('does not look like an e-mail address');
    expect(files.pdf).not.toHaveBeenCalled();
    expect(mailLinks).toEqual([]);
  });

  it('makes the file, saves it, and opens the mail with the address, the subject and the message', async () => {
    show({ quotation: quote({ clientEmail: 'meera@example.com' }) });
    await userEvent.click(mail());
    await waitFor(() => expect(mailLinks).toHaveLength(1));
    const params = new URLSearchParams(mailLinks[0].split('?')[1]);
    expect(mailLinks[0].startsWith('mailto:meera@example.com?')).toBe(true);
    expect(params.get('subject')).toBe('7Heaven Tourism: JAPAN TOURIST VISA quotation 7H-QT-0042');
    expect(params.get('body')).toBe(screen.getByLabelText('Message').value);
    expect(saveBlob).toHaveBeenCalledWith(pdfFile.blob, pdfFile.filename);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('attach it to the e-mail before sending'));
  });

  it('uses the subject as edited', async () => {
    show({ quotation: quote({ clientEmail: 'meera@example.com' }) });
    await userEvent.clear(screen.getByLabelText('Subject'));
    await userEvent.type(screen.getByLabelText('Subject'), 'Your Japan visa');
    await userEvent.click(mail());
    await waitFor(() => expect(mailLinks).toHaveLength(1));
    expect(new URLSearchParams(mailLinks[0].split('?')[1]).get('subject')).toBe('Your Japan visa');
  });
});

describe('PDF or Word', () => {
  it('sends a Word file when Word is chosen, and the wording of the message follows', async () => {
    show({ quotation: quote({ clientPhone: '9876543210' }) });
    await userEvent.click(screen.getByRole('radio', { name: /Word/ }));
    expect(screen.getByRole('radio', { name: /Word/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Message').value).toContain('attached as a Word file');
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    expect(files.docx).toHaveBeenCalledTimes(1);
    expect(files.pdf).not.toHaveBeenCalled();
    expect(saveBlob).toHaveBeenCalledWith(wordFile.blob, wordFile.filename);
  });

  it('leaves a message the person has changed alone when the file kind changes', async () => {
    show();
    await userEvent.clear(screen.getByLabelText('Message'));
    await userEvent.type(screen.getByLabelText('Message'), 'My own words');
    await userEvent.click(screen.getByRole('radio', { name: /Word/ }));
    expect(screen.getByLabelText('Message')).toHaveValue('My own words');
  });

  it('offers Word for visa quotations only', () => {
    show({ quotation: quote({ quotationType: 'Package' }) });
    expect(screen.getByRole('radio', { name: /Word/ })).toBeDisabled();
  });

  it('can just download the file', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Only download the PDF/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(pdfFile.blob, pdfFile.filename));
    expect(opened).not.toHaveBeenCalled();
    expect(await screen.findByText(`${pdfFile.filename} was saved to your computer.`)).toBeInTheDocument();
  });
});

describe('keeping the contact details on the quotation', () => {
  it('saves a number that was typed, once it has been sent', async () => {
    const onContactSaved = vi.fn();
    show({ onContactSaved });
    await userEvent.type(phoneField(), '9876543210');
    expect(screen.getByRole('checkbox', { name: /Keep these contact details/ })).toBeChecked();
    await userEvent.click(whatsapp());
    await waitFor(() => expect(quotationService.updateQuotation).toHaveBeenCalledWith('q1', { clientPhone: '+91 98765 43210' }));
    expect(onContactSaved).toHaveBeenCalledWith({ clientPhone: '+91 98765 43210' });
  });

  it('saves the e-mail address too, but only what is new', async () => {
    show({ quotation: quote({ clientPhone: '+91 98765 43210' }) });
    await userEvent.type(emailField(), 'meera@example.com');
    await userEvent.click(mail());
    await waitFor(() => expect(quotationService.updateQuotation).toHaveBeenCalledWith('q1', { clientEmail: 'meera@example.com' }));
  });

  it('does not save when the person unticks the box', async () => {
    show();
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(screen.getByRole('checkbox', { name: /Keep these contact details/ }));
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    expect(quotationService.updateQuotation).not.toHaveBeenCalled();
  });

  it('does not offer to save where the person may not change the quotation, and sends all the same', async () => {
    show({ canEdit: false });
    await userEvent.type(phoneField(), '9876543210');
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    expect(quotationService.updateQuotation).not.toHaveBeenCalled();
  });

  it('does not offer to save the number it already has, even typed another way', async () => {
    show({ quotation: quote({ clientPhone: '+91 98765 43210' }) });
    await userEvent.clear(phoneField());
    await userEvent.type(phoneField(), '09876543210');
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me\/919876543210/));
    expect(quotationService.updateQuotation).not.toHaveBeenCalled();
  });

  it('still opens WhatsApp when the number could not be saved, and says so', async () => {
    quotationService.updateQuotation.mockResolvedValue({ success: false, message: 'This quotation is confirmed and is locked.' });
    show();
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('could not be saved on the quotation: This quotation is confirmed and is locked.'));
  });
});

describe('sharing the file with an app', () => {
  it('is not offered where the browser cannot share files', () => {
    show();
    expect(screen.queryByRole('button', { name: /Share the file with an app/ })).toBeNull();
  });

  it('hands the file to the app the person picks, named and typed correctly', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn().mockResolvedValue(undefined);
    show();
    await userEvent.click(screen.getByRole('button', { name: /Share the file with an app/ }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    const arg = navigator.share.mock.calls[0][0];
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].name).toBe(pdfFile.filename);
    expect(arg.files[0].type).toBe('application/pdf');
    expect(arg.text).toBe(screen.getByLabelText('Message').value);
  });

  it('says nothing when the person changes their mind and closes the share sheet', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    show();
    await userEvent.click(screen.getByRole('button', { name: /Share the file with an app/ }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /Share the file with an app/ })).not.toBeDisabled());
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
