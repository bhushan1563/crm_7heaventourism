import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ download: true, user: { firstName: 'Sana', lastName: 'Tester', senderNumber: '+919876543210' }, showToast: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: h.user, can: (m, a) => (a === 'canDownload' ? h.download : true) }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../../utils/download', () => ({ saveBlob: vi.fn() }));

import ItineraryExportButtons from './ItineraryExportButtons';

const show = (props = {}) => render(<div style={{ overflow: 'hidden' }}><ItineraryExportButtons getItinerary={async () => ({ title: 'Bali' })} summary={{ title: 'Bali Honeymoon', destination: 'Bali', nights: 5 }} {...props} /></div>);

beforeEach(() => {
  h.download = true;
  h.user = { firstName: 'Sana', lastName: 'Tester', senderNumber: '+919876543210' };
});
afterEach(cleanup);

describe('the buttons of an itinerary', () => {
  it('offers Word, PDF and Send on WhatsApp or e-mail, labelled', () => {
    show();
    const group = screen.getByRole('group', { name: 'Download or send this itinerary' });
    for (const name of ['Download as Word document', 'Download as PDF', 'Send on WhatsApp or e-mail']) expect(within(group).getByRole('button', { name })).toBeEnabled();
    expect(within(group).getByRole('button', { name: 'Send on WhatsApp or e-mail' })).toHaveTextContent('Send');
  });

  it('keeps Send to an icon in the list, with its name for screen readers', () => {
    show({ variant: 'icon' });
    expect(screen.getByRole('button', { name: 'Send on WhatsApp or e-mail' })).not.toHaveTextContent('Send');
  });

  it('opens the window to send it, signed with the person\'s name and number, and closes it again', async () => {
    const { container } = show();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Send on WhatsApp or e-mail' }));
    const dialog = screen.getByRole('dialog', { name: 'Send this itinerary' });
    expect(dialog).toHaveTextContent('Bali Honeymoon · Bali');
    expect(within(dialog).getByLabelText('Message').value.endsWith('Sana Tester\n+919876543210')).toBe(true);
    expect(container.contains(dialog)).toBe(false); // it is in the page body, not inside the card that holds the buttons
    expect(document.body.contains(dialog)).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is not offered to someone who may not download itineraries', () => {
    h.download = false;
    show();
    expect(screen.getByRole('button', { name: 'Send on WhatsApp or e-mail' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send on WhatsApp or e-mail' })).toHaveAttribute('title', 'You do not have permission to send itineraries.');
  });

  it('still opens when the person has no name or number saved', async () => {
    h.user = null;
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Send on WhatsApp or e-mail' }));
    expect(screen.getByLabelText('Message').value).toContain('The 7Heaven Tourism team');
  });
});
