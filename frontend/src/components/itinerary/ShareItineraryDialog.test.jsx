import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const gen = vi.hoisted(() => ({ pdf: vi.fn(), docx: vi.fn() }));
vi.mock('../../utils/itineraryPdf', () => ({ generateItineraryPdf: (...a) => gen.pdf(...a) }));
vi.mock('../../utils/itineraryDocx', () => ({ generateItineraryDocx: (...a) => gen.docx(...a) }));
vi.mock('../../utils/download', () => ({ saveBlob: vi.fn() }));

import { saveBlob } from '../../utils/download';
import ShareItineraryDialog from './ShareItineraryDialog';

const summary = (over = {}) => ({ _id: 'i1', title: 'Bali Honeymoon', destination: 'Bali', country: 'Indonesia', nights: 5, ...over });
const whole = { ...summary(), days: [{ title: 'Arrival' }] };
const pdfFile = { blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), filename: 'bali-honeymoon-itinerary.pdf' };
const docxFile = { blob: new Blob(['docx']), filename: 'bali-honeymoon-itinerary.docx' };
const show = (props = {}) => render(<ShareItineraryDialog itinerary={summary()} isOpen onClose={() => {}} getItinerary={props.getItinerary || (async () => whole)} senderName="Sana Tester" senderNumber="+919876543210" {...props} />);
const phoneField = () => screen.getByLabelText('WhatsApp number');
const whatsapp = () => screen.getByRole('button', { name: /Send on WhatsApp/ });
const mail = () => screen.getByRole('button', { name: /Send by e-mail/ });

let popup;
let mailLinks;
const realClick = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  gen.pdf.mockReset().mockResolvedValue(pdfFile);
  gen.docx.mockReset().mockResolvedValue(docxFile);
  saveBlob.mockReset();
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

describe('the window for sending an itinerary', () => {
  it('says which itinerary it is, writes the message for it and signs it with the sender\'s name and number', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Send this itinerary' })).toBeInTheDocument();
    expect(screen.getByText('Bali Honeymoon · Bali')).toBeInTheDocument();
    const text = screen.getByLabelText('Message').value;
    expect(text).toContain('Please find the Bali Honeymoon itinerary for Bali, Indonesia attached as a PDF file.');
    expect(text).toContain('Duration: 5 Nights / 6 Days');
    expect(text.endsWith('Sana Tester\n+919876543210')).toBe(true);
    expect(screen.getByLabelText('Subject').value).toBe('7Heaven Tourism: Bali Honeymoon itinerary');
  });

  it('offers a PDF and a Word file, and the message follows the choice', async () => {
    show();
    expect(screen.getByRole('radio', { name: /^PDF/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Word/ })).toBeEnabled();
    await userEvent.click(screen.getByRole('radio', { name: /Word/ }));
    expect(screen.getByLabelText('Message').value).toContain('attached as a Word file');
  });

  it('asks for the number (an itinerary belongs to no client) and prepares nothing until it has one', async () => {
    show();
    expect(screen.getByRole('note')).toHaveTextContent('No WhatsApp number is saved for this client. Enter it to send on WhatsApp.');
    await userEvent.click(whatsapp());
    expect(screen.getByRole('alert')).toHaveTextContent("Enter the client's WhatsApp number");
    expect(phoneField()).toHaveFocus();
    expect(gen.pdf).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).toBeNull(); // nothing to keep: no client record to keep it on
  });

  it('makes the PDF from the whole itinerary, saves it and opens WhatsApp for the number with the message', async () => {
    const getItinerary = vi.fn(async () => whole);
    show({ getItinerary });
    await userEvent.type(phoneField(), '98765 43210');
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/));
    expect(getItinerary).toHaveBeenCalledTimes(1);
    expect(gen.pdf).toHaveBeenCalledWith(whole);
    expect(saveBlob).toHaveBeenCalledWith(pdfFile.blob, pdfFile.filename);
    expect(decodeURIComponent(popup.location.href.split('?text=')[1])).toBe(screen.getByLabelText('Message').value);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('The file bali-honeymoon-itinerary.pdf was saved to your computer'));
  });

  it('makes the Word file when Word is chosen', async () => {
    show();
    await userEvent.click(screen.getByRole('radio', { name: /Word/ }));
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    await waitFor(() => expect(popup.location.href).toMatch(/wa\.me/));
    expect(gen.docx).toHaveBeenCalledWith(whole);
    expect(gen.pdf).not.toHaveBeenCalled();
    expect(saveBlob).toHaveBeenCalledWith(docxFile.blob, docxFile.filename);
  });

  it('sends by e-mail with the itinerary\'s subject and message', async () => {
    show();
    await userEvent.type(screen.getByLabelText('E-mail address'), 'guest@example.com');
    await userEvent.click(mail());
    await waitFor(() => expect(mailLinks).toHaveLength(1));
    const params = new URLSearchParams(mailLinks[0].split('?')[1]);
    expect(mailLinks[0].startsWith('mailto:guest@example.com?')).toBe(true);
    expect(params.get('subject')).toBe('7Heaven Tourism: Bali Honeymoon itinerary');
    expect(params.get('body')).toBe(screen.getByLabelText('Message').value);
  });

  it('says what went wrong when the itinerary cannot be loaded, and closes the empty WhatsApp window', async () => {
    show({ getItinerary: async () => { throw new Error('The itinerary could not be loaded.'); } });
    await userEvent.type(phoneField(), '9876543210');
    await userEvent.click(whatsapp());
    expect(await screen.findByText(/could not be prepared|The itinerary could not be loaded/)).toBeInTheDocument();
    expect(popup.close).toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
