import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../../services/visaService', () => ({ default: { create: vi.fn() } }));

import visaService from '../../services/visaService';
import SaveVisaToList from './SaveVisaToList';

const quotation = (over = {}) => ({
  clientName: 'Meera Iyer',
  paxDetails: '2 Adults',
  visa: { country: 'Japan', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '90 days', stay: '15 days', processingTime: '5 working days', applicants: 3 },
  visaFees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }],
  visaDocuments: ['Passport', ''],
  visaInclusions: ['Form filling'],
  ...over
});
const saveButton = () => screen.getByRole('button', { name: /Save to the Visa List|Saved to the Visa List|Saving/ });

beforeEach(() => {
  visaService.create.mockReset().mockResolvedValue({ success: true, data: { _id: 'v1' } });
  h.showToast.mockReset();
});
afterEach(cleanup);

describe('SaveVisaToList', () => {
  it('sends the visa, its checklist, fees and inclusions, and nothing about the client', async () => {
    render(<SaveVisaToList quotation={quotation()} />);
    await userEvent.click(saveButton());
    await waitFor(() => expect(visaService.create).toHaveBeenCalledTimes(1));
    const payload = visaService.create.mock.calls[0][0];
    expect(payload).toMatchObject({ country: 'Japan', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '90 days', stay: '15 days', processingTime: '5 working days', documents: ['Passport'], inclusions: ['Form filling'] });
    expect(payload.fees).toEqual([{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }]);
    expect(JSON.stringify(payload)).not.toMatch(/Meera|Adults|applicants/);
    expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('Japan · Tourist was saved to the Visa List'), 'success');
  });

  it('shows it is saved, and cannot be pressed again until the visa is changed', async () => {
    const { rerender } = render(<SaveVisaToList quotation={quotation()} />);
    await userEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveTextContent('Saved to the Visa List'));
    expect(saveButton()).toBeDisabled();
    rerender(<SaveVisaToList quotation={quotation({ visa: { ...quotation().visa, country: 'Singapore' } })} />);
    expect(saveButton()).toHaveTextContent('Save to the Visa List');
    expect(saveButton()).not.toBeDisabled();
  });

  it('cannot save without the country, and says why', async () => {
    render(<SaveVisaToList quotation={quotation({ visa: { country: '  ' } })} />);
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveAttribute('title', 'Please enter the country this visa is for.');
    await userEvent.click(saveButton());
    expect(visaService.create).not.toHaveBeenCalled();
  });

  it('tells the person what the server said when the visa is already in the list', async () => {
    visaService.create.mockResolvedValue({ success: false, message: 'The Japan · Tourist · Single entry visa is already in the visa list. Search for it instead of adding it again.' });
    render(<SaveVisaToList quotation={quotation()} />);
    await userEvent.click(saveButton());
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('The Japan · Tourist · Single entry visa is already in the visa list. Search for it instead of adding it again.', 'error'));
    expect(saveButton()).not.toBeDisabled(); // nothing was saved, so it can be tried again
  });

  it('says in words when the server cannot be reached', async () => {
    visaService.create.mockRejectedValue(new Error('network'));
    render(<SaveVisaToList quotation={quotation()} />);
    await userEvent.click(saveButton());
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('The visa could not be saved to the Visa List. Please try again.', 'error'));
  });

  it('cannot be pressed twice while it is saving', async () => {
    let finish;
    visaService.create.mockReturnValue(new Promise((r) => { finish = () => r({ success: true }); }));
    render(<SaveVisaToList quotation={quotation()} />);
    await userEvent.click(saveButton());
    expect(saveButton()).toHaveTextContent('Saving…');
    expect(saveButton()).toBeDisabled();
    finish();
    await waitFor(() => expect(saveButton()).toHaveTextContent('Saved'));
    expect(visaService.create).toHaveBeenCalledTimes(1);
  });
});
