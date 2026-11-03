import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), admin: true }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (module, action) => (module === 'rights' && action === 'canUpdate' ? h.admin : true) }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../services/masterTextService', () => ({ default: { get: vi.fn(), save: vi.fn(), reset: vi.fn() } }));
// The real formatting editor has its own tests; here a line is a plain box.
vi.mock('../components/quotation/FormattedLine', () => ({ default: ({ value, onChange, ariaLabel, disabled }) => <input aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /> }));

import masterTextService from '../services/masterTextService';
import MasterTextPage from './MasterTextPage';
import { STANDARD_TEXT } from '../utils/standardText';

const saved = (over = {}) => ({ importantNotes: ['Our own note.'], paymentPolicy: ['Our payment line 1.', 'Our payment line 2.'], cancellationPolicy: ['Our cancellation line.'], exclusions: ['Our exclusion.'], vehicleNotes: [], updatedAt: '2026-11-04T10:00:00.000Z', updatedByName: 'Asha Rao', ...over });
const show = () => render(<MasterTextPage />);
const section = (title) => screen.getByRole('heading', { name: new RegExp(`^${title}`) }).closest('section');
const saveButton = () => screen.getByRole('button', { name: /Save changes/ });

beforeEach(() => {
  Object.values(masterTextService).forEach((fn) => fn.mockReset());
  h.showToast.mockReset();
  h.admin = true;
});
afterEach(cleanup);

describe('Notes & Policies (the Master Editor)', () => {
  it('shows the built-in text when nothing is saved, and says so', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: null });
    show();
    expect(await screen.findByText(/The built-in standard text is in use/)).toBeInTheDocument();
    for (const title of ['Important notes & terms', 'Payment policy', 'Cancellation policy', 'Exclusions', 'Vehicle notes']) expect(section(title)).toBeInTheDocument();
    expect(within(section('Payment policy')).getAllByRole('textbox').map((b) => b.value)).toEqual(STANDARD_TEXT.paymentPolicy);
    expect(saveButton()).toBeDisabled(); // nothing changed yet
    expect(screen.queryByRole('button', { name: /Back to the built-in text/ })).toBeNull();
  });

  it('shows the saved text, who saved it and when', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: saved() });
    show();
    expect(await screen.findByText("The company's own text, saved by Asha Rao on 04 Nov 2026.")).toBeInTheDocument();
    expect(within(section('Payment policy')).getAllByRole('textbox').map((b) => b.value)).toEqual(['Our payment line 1.', 'Our payment line 2.']);
    expect(within(section('Vehicle notes')).queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText(/A new quotation will start with nothing here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to the built-in text/ })).toBeInTheDocument();
  });

  it('flags a change, saves all five lists without the blank lines, and shows the new version as saved', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: null });
    masterTextService.save.mockResolvedValue({ success: true, message: 'The standard notes and policies were saved. New quotations will start with them.', data: saved({ exclusions: [...STANDARD_TEXT.exclusions, 'A new exclusion.'] }) });
    show();
    await screen.findByText(/built-in standard text/);
    const exclusions = section('Exclusions');
    await userEvent.click(within(exclusions).getByRole('button', { name: /Add a line/ }));
    await userEvent.click(within(exclusions).getByRole('button', { name: /Add a line/ })); // a second one, left blank
    const boxes = within(exclusions).getAllByRole('textbox');
    await userEvent.type(boxes[boxes.length - 2], 'A new exclusion.');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(saveButton());
    await waitFor(() => expect(masterTextService.save).toHaveBeenCalledTimes(1));
    const sent = masterTextService.save.mock.calls[0][0];
    expect(Object.keys(sent).sort()).toEqual(['cancellationPolicy', 'exclusions', 'importantNotes', 'paymentPolicy', 'vehicleNotes']);
    expect(sent.exclusions).toEqual([...STANDARD_TEXT.exclusions, 'A new exclusion.']); // the blank line is not sent
    expect(sent.updatedAt).toBeUndefined(); // nothing was saved before
    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/New quotations will start with them/), 'success');
    expect(await screen.findByText(/The company's own text, saved by Asha Rao/)).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('sends the version it saw when something is already saved', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: saved() });
    masterTextService.save.mockResolvedValue({ success: true, data: saved() });
    show();
    await screen.findByText(/The company's own text/);
    await userEvent.type(within(section('Important notes & terms')).getAllByRole('textbox')[0], ' More.');
    await userEvent.click(saveButton());
    await waitFor(() => expect(masterTextService.save).toHaveBeenCalled());
    expect(masterTextService.save.mock.calls[0][0].updatedAt).toBe('2026-11-04T10:00:00.000Z');
    expect(masterTextService.save.mock.calls[0][0].importantNotes).toEqual(['Our own note. More.']);
  });

  it('adds, moves and removes lines', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: saved() });
    show();
    await screen.findByText(/The company's own text/);
    const payment = () => within(section('Payment policy')).getAllByRole('textbox').map((b) => b.value);
    await userEvent.click(screen.getByRole('button', { name: 'Move Payment policy payment line 2 up' }));
    expect(payment()).toEqual(['Our payment line 2.', 'Our payment line 1.']);
    expect(screen.getByRole('button', { name: 'Move Payment policy payment line 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Payment policy payment line 2 down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Payment policy payment line 1' }));
    expect(payment()).toEqual(['Our payment line 1.']);
    await userEvent.click(within(section('Payment policy')).getByRole('button', { name: /Add a line/ }));
    expect(payment()).toEqual(['Our payment line 1.', '']);
  });

  it('refuses a line that is too long, in plain words, without asking the server', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: null });
    show();
    await screen.findByText(/built-in standard text/);
    const box = within(section('Exclusions')).getAllByRole('textbox')[0];
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste('x'.repeat(1001));
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The exclusion 1 in Exclusions is too long (the limit is 1000 characters).');
    expect(masterTextService.save).not.toHaveBeenCalled();
  });

  it('tells the Admin when someone else saved first, and loads the latest version when asked', async () => {
    masterTextService.get.mockResolvedValueOnce({ success: true, data: saved() }).mockResolvedValue({ success: true, data: saved({ importantNotes: ['Changed by someone else.'], updatedByName: 'Omar' }) });
    masterTextService.save.mockResolvedValue({ success: false, message: 'The standard notes and policies were changed by Omar while you were editing. Please reload to see their changes before saving yours.' });
    show();
    await screen.findByText(/The company's own text/);
    await userEvent.type(within(section('Payment policy')).getAllByRole('textbox')[0], '!');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by Omar while you were editing');
    await userEvent.click(screen.getByRole('button', { name: /Load the latest version/ }));
    expect(await screen.findByDisplayValue('Changed by someone else.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('goes back to the built-in text only after asking, and only then removes the saved text', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: saved() });
    masterTextService.reset.mockResolvedValue({ success: true, message: 'The standard notes and policies are back to the built-in text.', data: null });
    show();
    await screen.findByText(/The company's own text/);
    await userEvent.click(screen.getByRole('button', { name: /Back to the built-in text/ }));
    expect(masterTextService.reset).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'No, keep my text' }));
    expect(masterTextService.reset).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Back to the built-in text/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, go back' }));
    await waitFor(() => expect(masterTextService.reset).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/The built-in standard text is in use/)).toBeInTheDocument();
    expect(within(section('Payment policy')).getAllByRole('textbox').map((b) => b.value)).toEqual(STANDARD_TEXT.paymentPolicy);
  });

  it('is only readable for someone who may not change it: no buttons, nothing to type in', async () => {
    h.admin = false;
    masterTextService.get.mockResolvedValue({ success: true, data: saved() });
    show();
    expect(await screen.findByText('Only an Admin can change the standard text. You can read it here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes|Add a line|Back to the built-in text/ })).toBeNull();
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled();
  });

  it('shows a problem in plain words with a way to try again', async () => {
    masterTextService.get.mockResolvedValueOnce({ success: false, message: 'Access Denied: You do not have permissions for the quotations module.' }).mockResolvedValueOnce({ success: true, data: null });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Access Denied');
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText(/The built-in standard text is in use/)).toBeInTheDocument();
  });

  it('survives a network failure when saving with a plain message and keeps what was typed', async () => {
    masterTextService.get.mockResolvedValue({ success: true, data: null });
    masterTextService.save.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    show();
    await screen.findByText(/built-in standard text/);
    const box = within(section('Exclusions')).getAllByRole('textbox')[0];
    await userEvent.type(box, ' extra');
    await userEvent.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent.length).toBeGreaterThan(10);
    expect(alert.textContent).not.toMatch(/undefined|\[object/);
    expect(box).toHaveValue(`${STANDARD_TEXT.exclusions[0]} extra`);
  });
});
