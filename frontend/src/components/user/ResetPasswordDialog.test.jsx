import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/userService', () => ({ default: { resetPassword: vi.fn() } }));

import userService from '../../services/userService';
import ResetPasswordDialog from './ResetPasswordDialog';

const person = { _id: 'u1', email: 'ops1@7heaventourism.in', firstName: 'Ops', lastName: 'One' };
const show = (props = {}) => render(<ResetPasswordDialog user={person} isOpen onClose={() => {}} {...props} />);
const newPassword = () => screen.getByLabelText(/New password/);

beforeEach(() => {
  userService.resetPassword.mockReset();
});
afterEach(cleanup);

describe('ResetPasswordDialog', () => {
  it('says who is affected and what will happen to them', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Reset password: Ops One' })).toBeInTheDocument();
    expect(screen.getByText('ops1@7heaventourism.in')).toBeInTheDocument();
    expect(screen.getByText(/Ops One will be signed out on every device/)).toBeInTheDocument();
  });

  it('explains a weak password next to the field and does not ask the server', async () => {
    show();
    await userEvent.type(newPassword(), 'short');
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters.');
    expect(userService.resetPassword).not.toHaveBeenCalled();
    await userEvent.clear(newPassword());
    await userEvent.type(newPassword(), 'OPS1@7heaventourism.in');
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('must not be the same as the email address');
  });

  it('can show and hide what is typed', async () => {
    show();
    expect(newPassword()).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show the password' }));
    expect(newPassword()).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide the password' }));
    expect(newPassword()).toHaveAttribute('type', 'password');
  });

  it('makes a strong password on request and shows it so it can be read', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Make a strong password/ }));
    expect(newPassword()).toHaveAttribute('type', 'text');
    expect(newPassword().value).toHaveLength(12);
    expect(newPassword().value).toMatch(/[a-z]/);
    expect(newPassword().value).toMatch(/[A-Z]/);
    expect(newPassword().value).toMatch(/[0-9]/);
  });

  it('saves, then shows the password once with a copy button and the server\'s own message', async () => {
    userEvent.setup();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    userService.resetPassword.mockResolvedValue({ success: true, message: 'Password changed for Ops One. They were signed out on every device and must sign in with the new password.' });
    const onDone = vi.fn();
    show({ onDone });
    await userEvent.type(newPassword(), 'Brand-new-pass-9');
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect(userService.resetPassword).toHaveBeenCalledWith('u1', 'Brand-new-pass-9');
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed for Ops One.');
    expect(screen.getByLabelText('The new password')).toHaveValue('Brand-new-pass-9');
    expect(onDone).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/ })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith('Brand-new-pass-9');
  });

  it('shows the server\'s refusal in plain words and keeps what was typed', async () => {
    userService.resetPassword.mockResolvedValue({ success: false, message: 'The new password must be different from the current one.' });
    show();
    await userEvent.type(newPassword(), 'Same-as-before-1');
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The new password must be different from the current one.');
    expect(newPassword()).toHaveValue('Same-as-before-1');
  });

  it('tells the user when the request itself fails', async () => {
    userService.resetPassword.mockRejectedValue(new Error('Network Error'));
    show();
    await userEvent.type(newPassword(), 'Valid-pass-123');
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Change password/ })).toBeEnabled();
  });

  it('forgets the password when it is opened again', async () => {
    const { rerender } = show();
    await userEvent.type(newPassword(), 'Valid-pass-123');
    rerender(<ResetPasswordDialog user={person} isOpen={false} onClose={() => {}} />);
    rerender(<ResetPasswordDialog user={person} isOpen onClose={() => {}} />);
    expect(newPassword()).toHaveValue('');
  });
});
