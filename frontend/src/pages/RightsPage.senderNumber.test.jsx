import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The whole suite runs in parallel and the first screen of a file pays for loading its modules: allow far more than the usual second.
configure({ asyncUtilTimeout: 8000 });

const h = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'admin1', role: 'Admin', firstName: 'Bhushan', lastName: 'Doshi' } }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../services/userService', () => ({ default: { getUsers: vi.fn() } }));
vi.mock('../services/rightsService', () => ({ default: { getUserRights: vi.fn(), getRoleRights: vi.fn(), setSenderNumber: vi.fn(), updateUserRights: vi.fn(), updateRoleRights: vi.fn() } }));

import userService from '../services/userService';
import rightsService from '../services/rightsService';
import RightsPage from './RightsPage';

const people = [
  { _id: 'u1', firstName: 'Sana', lastName: 'Tester', email: 'sana@test.local', role: 'Sales', active: true, senderNumber: '+919876543210' },
  { _id: 'u2', firstName: 'Omar', lastName: 'Tester', email: 'omar@test.local', role: 'Ops', active: true, senderNumber: '' }
];
const box = () => screen.getByLabelText(/Sender number of/);
const saveButton = () => screen.getByRole('button', { name: /Save sender number/ });

beforeEach(() => {
  userService.getUsers.mockReset().mockResolvedValue({ success: true, data: people });
  rightsService.getUserRights.mockReset().mockResolvedValue({ success: true, data: {} });
  rightsService.getRoleRights.mockReset().mockResolvedValue({ success: true, data: {} });
  rightsService.setSenderNumber.mockReset();
  h.showToast.mockReset();
});
afterEach(cleanup);

describe('the sender number on Rights & Security', () => {
  it('shows the saved sender number of the selected person, and what it is for', async () => {
    render(<RightsPage />);
    expect(await screen.findByLabelText('Sender number of Sana Tester')).toHaveValue('+919876543210');
    expect(screen.getByText(/The number this person's messages to clients carry/)).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp itself sends from the account signed in on their device/)).toBeInTheDocument();
  });

  it('shows the number of whoever is chosen next, empty when there is none', async () => {
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /User Reference/ }), 'u2');
    expect(await screen.findByLabelText('Sender number of Omar Tester')).toHaveValue('');
  });

  it('can only be saved once it was changed', async () => {
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    expect(saveButton()).toBeDisabled();
    await userEvent.type(box(), '1');
    expect(saveButton()).toBeEnabled();
    await userEvent.type(box(), '{Backspace}');
    expect(saveButton()).toBeDisabled();
  });

  it('saves what was typed, says what the server said, and shows the number as it was stored', async () => {
    rightsService.setSenderNumber.mockResolvedValue({ success: true, message: 'The sender number of Omar Tester is now +919000000001.', data: { _id: 'u2', senderNumber: '+919000000001' } });
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /User Reference/ }), 'u2');
    await screen.findByLabelText('Sender number of Omar Tester');
    await userEvent.type(box(), '  90000 00001 ');
    await userEvent.click(saveButton());
    await waitFor(() => expect(rightsService.setSenderNumber).toHaveBeenCalledWith('u2', '90000 00001'));
    expect(h.showToast).toHaveBeenCalledWith('The sender number of Omar Tester is now +919000000001.', 'success');
    await waitFor(() => expect(box()).toHaveValue('+919000000001'));
    expect(saveButton()).toBeDisabled();
  });

  it('shows the stored form even when what was typed is the number that was already there', async () => {
    rightsService.setSenderNumber.mockResolvedValue({ success: true, message: 'The sender number of Sana Tester is now +919876543210.', data: { _id: 'u1', senderNumber: '+919876543210' } });
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.clear(box());
    await userEvent.type(box(), '98765 43210'); // the same number, typed another way
    await userEvent.click(saveButton());
    await waitFor(() => expect(rightsService.setSenderNumber).toHaveBeenCalledWith('u1', '98765 43210'));
    await waitFor(() => expect(box()).toHaveValue('+919876543210'));
    expect(saveButton()).toBeDisabled();
  });

  it('removes the number when the box is emptied', async () => {
    rightsService.setSenderNumber.mockResolvedValue({ success: true, message: 'The sender number of Sana Tester was removed. Their messages will carry the company number.', data: { _id: 'u1', senderNumber: '' } });
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.clear(box());
    await userEvent.click(saveButton());
    await waitFor(() => expect(rightsService.setSenderNumber).toHaveBeenCalledWith('u1', ''));
    await waitFor(() => expect(box()).toHaveValue(''));
  });

  it('explains a number that cannot be right, next to the box, and does not ask the server', async () => {
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.clear(box());
    await userEvent.type(box(), '12345');
    await userEvent.click(saveButton());
    expect(screen.getByRole('alert')).toHaveTextContent(/too short/);
    expect(rightsService.setSenderNumber).not.toHaveBeenCalled();
    await userEvent.type(box(), '6');
    expect(screen.queryByRole('alert')).toBeNull(); // typing again clears the message
  });

  it('shows the server\'s own message when it refuses, and keeps what was typed', async () => {
    rightsService.setSenderNumber.mockResolvedValue({ success: false, message: 'Permission Denied: You do not have \'Update\' rights for rights.' });
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.clear(box());
    await userEvent.type(box(), '9876500000');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission Denied');
    expect(box()).toHaveValue('9876500000');
    expect(h.showToast).not.toHaveBeenCalledWith(expect.anything(), 'success');
  });

  it('says in words when the server cannot be reached', async () => {
    rightsService.setSenderNumber.mockRejectedValue(new Error('network'));
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.type(box(), '0');
    await userEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The sender number could not be saved. Please try again.');
  });

  it('is for one person, so it is not shown while rights are set for a whole role', async () => {
    render(<RightsPage />);
    await screen.findByLabelText('Sender number of Sana Tester');
    await userEvent.click(screen.getByRole('button', { name: 'Whole role' }));
    expect(screen.queryByLabelText(/Sender number of/)).toBeNull();
  });
});
