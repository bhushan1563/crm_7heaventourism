import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), perms: { create: true, delete: true, edit: true, quote: true } }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: (m, a) => (m === 'quotations' ? h.perms.quote : a === 'canCreate' ? h.perms.create : a === 'canDelete' ? h.perms.delete : true), canEditRecord: () => h.perms.edit })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => {
  const real = await orig();
  return { ...real, useNavigate: () => { const go = real.useNavigate(); return (to, opts) => (String(to).startsWith('/quotations') ? h.navigate(to) : go(to, opts)); } };
});
vi.mock('../services/visaService', () => ({ default: { get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
// The real formatting editor has its own tests; here it is a simple stand-in.
vi.mock('../components/LazyRichTextEditor', () => ({ default: ({ value, onChange, ariaLabel }) => <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} /> }));

import visaService from '../services/visaService';
import VisaEditorPage from './VisaEditorPage';

const stored = (over = {}) => ({
  _id: 'v1', country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 days', priceNote: '',
  fees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }], documents: ['Passport'], inclusions: ['Form filling'], notes: '', status: 'Active', updatedAt: '2026-11-01T10:00:00.000Z', createdBy: 'u1', ...over
});
const show = (path) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/visas" element={<div>the list</div>} /><Route path="/visas/new" element={<VisaEditorPage />} /><Route path="/visas/:id/edit" element={<VisaEditorPage />} /></Routes></MemoryRouter>);

beforeEach(() => {
  Object.values(visaService).forEach((fn) => fn.mockReset());
  h.showToast.mockReset();
  h.navigate.mockReset();
  h.perms = { create: true, delete: true, edit: true, quote: true };
});
afterEach(cleanup);

describe('VisaEditorPage: adding a visa', () => {
  it('needs the country first, in plain words, and asks nothing of the server', async () => {
    show('/visas/new');
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Number of applicants *')).toBeNull(); // a visa in the list has no applicants: that is for a quotation
    await userEvent.click(screen.getByRole('button', { name: /Add visa/ }));
    expect(visaService.create).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter the country this visa is for.');
    expect(h.showToast).toHaveBeenCalledWith('Please enter the country this visa is for.', 'warning');
  });

  it('saves what was typed and moves on to the saved visa', async () => {
    visaService.create.mockResolvedValue({ success: true, data: stored() });
    show('/visas/new');
    await userEvent.type(screen.getByLabelText('Country *'), 'United Arab Emirates');
    await userEvent.type(screen.getByLabelText('Visa type'), 'Tourist');
    await userEvent.selectOptions(screen.getByLabelText('Entry type'), 'Single entry');
    await userEvent.type(document.querySelector('#fee-amount-0'), '6500');
    await userEvent.click(screen.getByRole('button', { name: /Add a document/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Documents required 1:/ }));
    await userEvent.type(screen.getByLabelText('Documents required 1'), 'Passport');
    await userEvent.click(screen.getByRole('button', { name: /Add visa/ }));
    await waitFor(() => expect(visaService.create).toHaveBeenCalled());
    const payload = visaService.create.mock.calls[0][0];
    expect(payload).toMatchObject({ country: 'United Arab Emirates', visaType: 'Tourist', entryType: 'Single entry', documents: ['Passport'] });
    expect(payload.fees[0]).toEqual({ label: 'Visa fee', amount: 6500, per: 'applicant' });
    expect(h.showToast).toHaveBeenCalledWith('Visa added to the list.', 'success');
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('shows a refusal from the server in plain words and keeps what was typed', async () => {
    visaService.create.mockResolvedValue({ success: false, message: 'The United Arab Emirates, Tourist visa is already in the visa list. Search for it instead of adding it again.' });
    show('/visas/new');
    await userEvent.type(screen.getByLabelText('Country *'), 'United Arab Emirates');
    await userEvent.click(screen.getByRole('button', { name: /Add visa/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('is already in the visa list');
    expect(screen.getByLabelText('Country *')).toHaveValue('United Arab Emirates');
  });

  it('is locked for someone who may not add visas', () => {
    h.perms.create = false;
    show('/visas/new');
    expect(screen.getByText('You do not have permission to add visas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add visa/ })).toBeNull();
  });
});

describe('VisaEditorPage: an existing visa', () => {
  it('loads it, flags changes, and saves with the version it was loaded at', async () => {
    visaService.get.mockResolvedValue({ success: true, data: stored() });
    visaService.update.mockResolvedValue({ success: true, data: stored({ validity: '90 days', updatedAt: '2026-11-01T11:00:00.000Z' }) });
    show('/visas/v1/edit');
    expect(await screen.findByRole('heading', { name: 'United Arab Emirates · Tourist' })).toBeInTheDocument();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save changes/ })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Validity'));
    await userEvent.type(screen.getByLabelText('Validity'), '90 days');
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(visaService.update).toHaveBeenCalled());
    const [id, payload] = visaService.update.mock.calls[0];
    expect(id).toBe('v1');
    expect(payload).toMatchObject({ validity: '90 days', country: 'United Arab Emirates', updatedAt: '2026-11-01T10:00:00.000Z' });
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('offers the latest version after a clash with someone else\'s save, keeping what was typed meanwhile', async () => {
    visaService.get.mockResolvedValue({ success: true, data: stored() });
    visaService.update.mockResolvedValue({ success: false, message: 'This visa was changed by Omar Ops while you were editing it. Please reload to see their changes before saving.' });
    show('/visas/v1/edit');
    await screen.findByRole('heading', { name: /United Arab Emirates/ });
    await userEvent.type(screen.getByLabelText('Validity'), ' extra');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by Omar Ops while you were editing it');
    expect(screen.getByLabelText('Validity')).toHaveValue('60 days extra');
    visaService.get.mockResolvedValue({ success: true, data: stored({ validity: '45 days' }) });
    await userEvent.click(screen.getByRole('button', { name: /Load the latest version/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Load the latest version' }));
    await waitFor(() => expect(screen.getByLabelText('Validity')).toHaveValue('45 days'));
  });

  it('archives and restores, and deletes only after confirmation', async () => {
    visaService.get.mockResolvedValue({ success: true, data: stored() });
    visaService.update.mockResolvedValue({ success: true, data: stored({ status: 'Archived' }) });
    visaService.remove.mockResolvedValue({ success: true });
    show('/visas/v1/edit');
    await screen.findByRole('heading', { name: /United Arab Emirates/ });
    await userEvent.click(screen.getByRole('button', { name: /Archive/ }));
    await waitFor(() => expect(visaService.update).toHaveBeenCalledWith('v1', { status: 'Archived' }));
    expect(await screen.findByText('Archived', { selector: '.cf-badge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restore/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(visaService.remove).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete this visa?' })).getByRole('button', { name: 'Delete visa' }));
    await waitFor(() => expect(visaService.remove).toHaveBeenCalledWith('v1'));
    expect(await screen.findByText('the list')).toBeInTheDocument();
  });

  it('starts a visa quotation from it', async () => {
    visaService.get.mockResolvedValue({ success: true, data: stored() });
    show('/visas/v1/edit');
    await screen.findByRole('heading', { name: /United Arab Emirates/ });
    await userEvent.click(screen.getByRole('button', { name: /Create quotation/ }));
    expect(h.navigate).toHaveBeenCalledWith('/quotations/new?visaId=v1');
  });

  it('warns before leaving with unsaved changes', async () => {
    visaService.get.mockResolvedValue({ success: true, data: stored() });
    show('/visas/v1/edit');
    await screen.findByRole('heading', { name: /United Arab Emirates/ });
    await userEvent.type(screen.getByLabelText('Validity'), '!');
    await userEvent.click(screen.getByRole('button', { name: /^Visa List$/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('the list')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Visa List$/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByText('the list')).toBeInTheDocument();
  });

  it('is read only for someone who may not change it, and explains when it cannot be opened', async () => {
    h.perms.edit = false;
    visaService.get.mockResolvedValueOnce({ success: true, data: stored() });
    const { unmount } = show('/visas/v1/edit');
    expect(await screen.findByText('You can look at this visa but not change it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull();
    expect(screen.getByLabelText('Country *')).toBeDisabled();
    unmount();
    h.perms.edit = true;
    visaService.get.mockResolvedValueOnce({ success: false, message: 'Visa not found. It may have been removed.' });
    visaService.get.mockResolvedValueOnce({ success: true, data: stored() });
    show('/visas/v1/edit');
    expect(await screen.findByRole('alert')).toHaveTextContent('Visa not found. It may have been removed.');
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('heading', { name: /United Arab Emirates/ })).toBeInTheDocument();
  });
});
