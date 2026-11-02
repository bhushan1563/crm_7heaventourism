import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/visaService', () => ({ default: { list: vi.fn(), get: vi.fn() } }));

import visaService from '../../services/visaService';
import VisaPicker from './VisaPicker';

const row = (n, over = {}) => ({ _id: `v${n}`, country: `Country ${n}`, visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', processingTime: '3 days', documentCount: 5, fees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }], ...over });
const show = (props = {}) => render(<VisaPicker isOpen onClose={() => {}} onPick={() => {}} {...props} />);

beforeEach(() => {
  visaService.list.mockReset();
  visaService.get.mockReset();
});
afterEach(cleanup);

describe('VisaPicker', () => {
  it('lists the active visas of the list with what each includes', async () => {
    visaService.list.mockResolvedValue({ success: true, data: [row(1), row(2, { documentCount: 1, fees: [] })] });
    show();
    expect(await screen.findByRole('button', { name: 'Use Country 1, Tourist, Single entry' })).toBeInTheDocument();
    expect(screen.getByText('e-Visa · 3 days · 5 documents')).toBeInTheDocument();
    expect(screen.getByText('Rs 6,500 per applicant')).toBeInTheDocument();
    expect(screen.getByText('Fees not set')).toBeInTheDocument();
    expect(visaService.list).toHaveBeenCalledWith({ search: undefined, status: 'Active', limit: 20 });
  });

  it('searches as the person types', async () => {
    visaService.list.mockResolvedValue({ success: true, data: [row(1)] });
    show();
    await screen.findByText(/Country 1/);
    await userEvent.type(screen.getByLabelText('Search the visa list'), 'dub');
    await waitFor(() => expect(visaService.list).toHaveBeenLastCalledWith({ search: 'dub', status: 'Active', limit: 20 }));
  });

  it('hands over the WHOLE visa (checklist and inclusions), not just the row', async () => {
    visaService.list.mockResolvedValue({ success: true, data: [row(1)] });
    visaService.get.mockResolvedValue({ success: true, data: { ...row(1), documents: ['Passport', 'Photos'], inclusions: ['Form filling'] } });
    const onPick = vi.fn();
    show({ onPick });
    await userEvent.click(await screen.findByRole('button', { name: /Use Country 1/ }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(visaService.get).toHaveBeenCalledWith('v1');
    expect(onPick.mock.calls[0][0]).toMatchObject({ documents: ['Passport', 'Photos'], inclusions: ['Form filling'] });
  });

  it('says what is wrong in plain words when the list or a visa cannot be opened', async () => {
    visaService.list.mockResolvedValue({ success: false, message: 'Access Denied: You do not have permissions for the visas module.' });
    const { unmount } = show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Access Denied');
    unmount();
    visaService.list.mockResolvedValue({ success: true, data: [row(1)] });
    visaService.get.mockResolvedValue({ success: false, message: 'Visa not found. It may have been removed.' });
    const onPick = vi.fn();
    show({ onPick });
    await userEvent.click(await screen.findByRole('button', { name: /Use Country 1/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Visa not found');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('says what to do when the list is empty, or the search finds nothing', async () => {
    visaService.list.mockResolvedValue({ success: true, data: [] });
    show();
    expect(await screen.findByText(/The visa list is empty/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search the visa list'), 'zzz');
    expect(await screen.findByText('No visa matches that search.')).toBeInTheDocument();
  });
});
