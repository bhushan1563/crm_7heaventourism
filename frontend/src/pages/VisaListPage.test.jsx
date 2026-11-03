import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), perms: { create: true, delete: true, edit: true, quote: true } }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: (m, a) => (m === 'quotations' ? h.perms.quote : a === 'canCreate' ? h.perms.create : a === 'canDelete' ? h.perms.delete : true), canEditRecord: () => h.perms.edit })
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => h.navigate }));
vi.mock('../components/visa/ClientVisasPanel', () => ({ default: () => <div>CLIENT VISAS PANEL</div> }));
vi.mock('../services/visaService', () => ({ default: { list: vi.fn(), update: vi.fn(), remove: vi.fn() } }));

import visaService from '../services/visaService';
import VisaListPage from './VisaListPage';

const item = (n, over = {}) => ({
  _id: `id${n}`, country: `Country ${n}`, visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '60 days', stay: '30 days', processingTime: '3 working days',
  fees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }], status: 'Active', documentCount: 4, updatedAt: '2026-11-01T10:00:00.000Z', updatedByName: 'Asha Rao', ...over
});
const page = (data, over = {}) => ({ success: true, data, total: data.length, page: 1, limit: 20, pages: 1, ...over });
const show = () => render(<MemoryRouter><VisaListPage /></MemoryRouter>);

beforeEach(() => {
  Object.values(visaService).forEach((fn) => fn.mockReset());
  h.showToast.mockReset();
  h.navigate.mockReset();
  h.perms = { create: true, delete: true, edit: true, quote: true };
});
afterEach(cleanup);

describe('VisaListPage', () => {
  it('lists each visa with its details, usual fees and checklist size', async () => {
    visaService.list.mockResolvedValue(page([item(1), item(2, { fees: [], documentCount: 1, mode: '', processingTime: '' })]));
    show();
    expect(await screen.findByText('Country 1')).toBeInTheDocument();
    expect(screen.getByText('2 visas')).toBeInTheDocument();
    expect(screen.getAllByText('Tourist · Single entry')).toHaveLength(2);
    expect(screen.getByText('e-Visa · 3 working days')).toBeInTheDocument();
    expect(screen.getAllByText('Valid 60 days · Stay 30 days').length).toBeGreaterThan(0);
    expect(screen.getByText('Rs 6,500 per applicant + Rs 800 once')).toBeInTheDocument();
    expect(screen.getByText('Fees not set')).toBeInTheDocument();
    expect(screen.getByText('4 documents')).toBeInTheDocument();
    expect(screen.getByText('1 document')).toBeInTheDocument();
    expect(visaService.list).toHaveBeenCalledWith({ status: 'Active', page: 1, limit: 20 });
  });

  it('searches once typing pauses, filters by status, and resets', async () => {
    visaService.list.mockResolvedValue(page([item(1)]));
    show();
    await screen.findByText('Country 1');
    await userEvent.type(screen.getByLabelText('Search visas'), 'dubai');
    await waitFor(() => expect(visaService.list).toHaveBeenLastCalledWith({ search: 'dubai', status: 'Active', page: 1, limit: 20 }));
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await waitFor(() => expect(visaService.list).toHaveBeenLastCalledWith({ search: 'dubai', status: 'Archived', page: 1, limit: 20 }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(visaService.list).toHaveBeenLastCalledWith({ status: 'Active', page: 1, limit: 20 }));
  });

  it('says what to do when the list is empty, and when nothing matches', async () => {
    visaService.list.mockResolvedValue(page([]));
    show();
    expect(await screen.findByText('No visas yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add the first visa/ }));
    expect(h.navigate).toHaveBeenCalledWith('/visas/new');
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(await screen.findByText('No visas match')).toBeInTheDocument();
  });

  it('shows a problem in plain words with a way to try again', async () => {
    visaService.list.mockResolvedValueOnce({ success: false, message: 'Access Denied: You do not have permissions for the visas module.' });
    visaService.list.mockResolvedValueOnce(page([item(1)]));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Access Denied');
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Country 1')).toBeInTheDocument();
  });

  it('opens a visa, and starts a visa quotation from it', async () => {
    visaService.list.mockResolvedValue(page([item(1)]));
    show();
    await screen.findByText('Country 1');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(h.navigate).toHaveBeenCalledWith('/visas/id1/edit');
    await userEvent.click(screen.getByRole('button', { name: 'Create quotation for Country 1 · Tourist' }));
    expect(h.navigate).toHaveBeenCalledWith('/quotations/new?visaId=id1');
  });

  it('archives and restores with a clear message, and deletes only after confirmation', async () => {
    visaService.list.mockResolvedValue(page([item(1), item(2, { status: 'Archived' })]));
    visaService.update.mockResolvedValue({ success: true });
    visaService.remove.mockResolvedValue({ success: true });
    show();
    await screen.findByText('Country 1');
    await userEvent.click(screen.getByRole('button', { name: 'Archive Country 1 · Tourist' }));
    await waitFor(() => expect(visaService.update).toHaveBeenCalledWith('id1', { status: 'Archived' }));
    expect(h.showToast).toHaveBeenCalledWith('Country 1 · Tourist was archived. It stays saved and can be restored.', 'success');
    await userEvent.click(screen.getByRole('button', { name: 'Restore Country 2 · Tourist' }));
    await waitFor(() => expect(visaService.update).toHaveBeenCalledWith('id2', { status: 'Active' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Country 1 · Tourist' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this visa?' });
    expect(visaService.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete visa' }));
    await waitFor(() => expect(visaService.remove).toHaveBeenCalledWith('id1'));
  });

  it('without the rights: no add, no delete, no archive, and "View" instead of "Edit"', async () => {
    h.perms = { create: false, delete: false, edit: false, quote: false };
    visaService.list.mockResolvedValue(page([item(1)]));
    show();
    await screen.findByText('Country 1');
    expect(screen.getByRole('button', { name: /Adding locked/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archive|Delete|Create quotation/ })).toBeNull();
  });

  it('pages through a long list', async () => {
    visaService.list.mockResolvedValue(page([item(1)], { total: 45, pages: 3 }));
    show();
    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(visaService.list).toHaveBeenLastCalledWith({ status: 'Active', page: 2, limit: 20 }));
  });
});

describe('VisaListPage: saved visas and client visas', () => {
  const showAt = (url) => render(<MemoryRouter initialEntries={[url]}><VisaListPage /></MemoryRouter>);
  beforeEach(() => {
    visaService.list.mockResolvedValue(page([item(1)]));
  });

  it('opens on the saved visas, with a switch to the visa quotations made for clients', async () => {
    show();
    expect(await screen.findByText('Country 1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Saved visas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Client visas' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByText('CLIENT VISAS PANEL')).toBeNull();
  });

  it('shows the visa quotations when Client visas is chosen, and takes the saved-visa tools away', async () => {
    show();
    await screen.findByText('Country 1');
    await userEvent.click(screen.getByRole('tab', { name: 'Client visas' }));
    expect(screen.getByText('CLIENT VISAS PANEL')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Client visas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Country 1')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add visa/ })).toBeNull();
    expect(screen.queryByLabelText('Search visas')).toBeNull();
    expect(screen.getByText(/find it by destination, change it, and send it to the client/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Saved visas' }));
    expect(await screen.findByText('Country 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add visa/ })).toBeInTheDocument();
  });

  it('can be opened straight on the client visas by its link', () => {
    showAt('/visas?view=clients');
    expect(screen.getByText('CLIENT VISAS PANEL')).toBeInTheDocument();
  });

  it('shows no switch, and ignores the link, for someone who may not see quotations', async () => {
    h.perms.quote = false;
    showAt('/visas?view=clients');
    expect(await screen.findByText('Country 1')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Client visas' })).toBeNull();
    expect(screen.queryByText('CLIENT VISAS PANEL')).toBeNull();
  });
});
