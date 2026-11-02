import React, { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Wand2 } from 'lucide-react';
import Modal from '../Modal';
import userService from '../../services/userService';
import { getErrorMessage } from '../../services/api';
import { generatePassword, passwordProblem } from '../../utils/password';

/**
 * An Admin sets a new password for someone. The person is signed out everywhere and must use it from now on. After it is saved, the
 * password is shown once so it can be copied and handed over: it is stored only in scrambled form and cannot be read back later.
 */
export const ResetPasswordDialog = ({ user, isOpen, onClose, onDone }) => {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { message, password }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setVisible(false);
      setBusy(false);
      setError('');
      setDone(null);
      setCopied(false);
    }
  }, [isOpen, user?._id]);

  if (!user) return null;
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError('The password could not be copied. Please select it and copy it by hand.');
    }
  };

  const generate = () => {
    setPassword(generatePassword());
    setVisible(true); // a generated password is only useful if it can be seen
    setError('');
    setCopied(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(password, { email: user.email });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await userService.resetPassword(user._id, password);
      if (res.success) {
        setDone({ message: res.message, password });
        onDone?.(res);
      } else {
        setError(res.message || 'The password could not be changed.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'The password could not be changed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title={`Reset password: ${name}`} subtitle={user.email} maxWidth="520px">
      {done ? (
        <div role="status">
          <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{done.message}</p>
          <p className="edit-hint" style={{ marginTop: 0 }}>Give {name} the new password now. For safety it is not stored in a form that can be shown again.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 18px' }}>
            <input type="text" readOnly className="form-input" value={done.password} aria-label="The new password" style={{ fontFamily: 'monospace', fontWeight: 700 }} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-outline" onClick={() => copy(done.password)}>
              {copied ? <Check size={15} /> : <Copy size={15} />} <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="edit-hint" style={{ marginTop: 0 }}>{name} will be signed out on every device and must sign in with the new password.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-password">New password <span style={{ fontWeight: 400 }}>(8 to 72 characters)</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="reset-password" type={visible ? 'text' : 'password'} className="form-input" autoComplete="new-password" value={password} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'reset-password-error' : undefined} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
              <button type="button" className="btn-icon btn-outline" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide the password' : 'Show the password'} title={visible ? 'Hide' : 'Show'}>
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && <p className="field-error" id="reset-password-error" role="alert">{error}</p>}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={generate} disabled={busy}>
            <Wand2 size={14} /> <span>Make a strong password for me</span>
          </button>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <KeyRound size={15} /> {busy ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ResetPasswordDialog;
