import React, { useRef, useState } from 'react';
import { Camera, Trash2, Eye, EyeOff, Lock, Mail, ShieldCheck, CalendarDays, Loader2, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from '../components/Avatar';
import authService from '../services/authService';
import { getErrorMessage } from '../services/api';
import { fileToAvatarDataUrl } from '../utils/image';
import { formatDate } from '../utils/dateHelper';

const PHONE_PATTERN = /^[0-9+()\-\s.]{5,20}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

const FieldError = ({ id, message }) =>
  message ? (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  ) : null;

// 0 (empty) .. 4 (strong): length plus character variety, just to guide people towards a better password.
const passwordStrength = (value) => {
  if (!value) return 0;
  let score = 0;
  if (value.length >= MIN_PASSWORD) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  return Math.max(1, score);
};
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export const ProfilePage = () => {
  const { user, updateUser, replaceToken } = useAuth();
  const { showToast } = useToast();
  const fileInput = useRef(null);

  // ---- photo ----
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [dragging, setDragging] = useState(false);

  const savePhoto = async (file) => {
    setPhotoError('');
    setPhotoBusy(true);
    try {
      const image = await fileToAvatarDataUrl(file);
      const res = await authService.setAvatar(image);
      if (res.success) {
        updateUser(res.user);
        showToast('Profile photo updated.', 'success');
      } else {
        setPhotoError(res.message);
      }
    } catch (err) {
      setPhotoError(err.response ? getErrorMessage(err) : err.message);
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePhoto = async () => {
    setPhotoError('');
    setPhotoBusy(true);
    try {
      const res = await authService.removeAvatar();
      if (res.success) {
        updateUser(res.user);
        showToast('Profile photo removed.', 'success');
      } else {
        setPhotoError(res.message);
      }
    } catch (err) {
      setPhotoError(getErrorMessage(err, 'Could not remove the photo.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  // ---- personal details ----
  const [details, setDetails] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '' });
  const [detailErrors, setDetailErrors] = useState({});
  const [savingDetails, setSavingDetails] = useState(false);
  const detailsDirty =
    details.firstName.trim() !== (user?.firstName || '') || details.lastName.trim() !== (user?.lastName || '') || details.phone.trim() !== (user?.phone || '');

  const validateDetails = () => {
    const errors = {};
    if (!details.firstName.trim()) errors.firstName = 'First name is required.';
    else if (details.firstName.trim().length > 50) errors.firstName = 'First name can be at most 50 characters.';
    if (!details.lastName.trim()) errors.lastName = 'Last name is required.';
    else if (details.lastName.trim().length > 50) errors.lastName = 'Last name can be at most 50 characters.';
    if (details.phone.trim() && !PHONE_PATTERN.test(details.phone.trim())) errors.phone = 'Enter a valid phone number (digits, +, spaces, dashes).';
    return errors;
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    const errors = validateDetails();
    setDetailErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingDetails(true);
    try {
      const res = await authService.updateProfile(details);
      if (res.success) {
        updateUser(res.user);
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update your profile.'), 'error');
    } finally {
      setSavingDetails(false);
    }
  };

  // ---- password ----
  const emptyPasswords = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const strength = passwordStrength(passwords.newPassword);

  const validatePasswords = () => {
    const errors = {};
    if (!passwords.currentPassword) errors.currentPassword = 'Enter your current password.';
    if (passwords.newPassword.length < MIN_PASSWORD) errors.newPassword = `Use at least ${MIN_PASSWORD} characters.`;
    else if (passwords.newPassword.length > MAX_PASSWORD) errors.newPassword = `Use at most ${MAX_PASSWORD} characters.`;
    else if (passwords.newPassword === passwords.currentPassword) errors.newPassword = 'The new password must be different from the current one.';
    if (passwords.confirmPassword !== passwords.newPassword) errors.confirmPassword = 'The two passwords do not match.';
    return errors;
  };

  const savePassword = async (event) => {
    event.preventDefault();
    const errors = validatePasswords();
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingPassword(true);
    try {
      const res = await authService.changePassword(passwords);
      if (res.success) {
        if (res.token) replaceToken(res.token);
        setPasswords(emptyPasswords);
        showToast(res.message, 'success');
      } else {
        // Most likely "current password is incorrect": show it next to that field.
        if (/current password/i.test(res.message)) setPasswordErrors({ currentPassword: res.message });
        else showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to change your password.'), 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const setDetail = (field) => (event) => {
    setDetails((prev) => ({ ...prev, [field]: event.target.value }));
    if (detailErrors[field]) setDetailErrors((prev) => ({ ...prev, [field]: undefined }));
  };
  const setPassword = (field) => (event) => {
    setPasswords((prev) => ({ ...prev, [field]: event.target.value }));
    if (passwordErrors[field]) setPasswordErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) savePhoto(file);
  };

  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const passwordType = showPasswords ? 'text' : 'password';

  return (
    <div className="profile-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">My Profile</h2>
            <span className="count-chip">{user?.role}</span>
          </div>
          <p className="page-subtitle">Manage your photo, personal details and password.</p>
        </div>
      </div>

      <div className="profile-grid">
        {/* ---------- Photo + identity ---------- */}
        <section className="section-card profile-identity">
          <div
            className={`profile-photo${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Avatar user={user} size={132} />
            {photoBusy && (
              <div className="profile-photo-busy" role="status" aria-label="Uploading photo">
                <Loader2 size={26} className="animate-spin" />
              </div>
            )}
          </div>

          <div className="profile-name">{fullName}</div>
          <div className="profile-email">{user?.email}</div>

          <div className="profile-photo-actions">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              data-testid="avatar-input"
              onChange={(event) => event.target.files?.[0] && savePhoto(event.target.files[0])}
            />
            <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={photoBusy}>
              <Camera size={16} />
              <span>{user?.avatar ? 'Change photo' : 'Upload photo'}</span>
            </button>
            {user?.avatar && (
              <button type="button" className="btn btn-outline" onClick={removePhoto} disabled={photoBusy}>
                <Trash2 size={15} />
                <span>Remove</span>
              </button>
            )}
          </div>
          <p className="profile-hint">JPG, PNG or WebP. Drop an image here, or choose one. It is cropped to a square and resized automatically.</p>
          <FieldError message={photoError} />

          <dl className="profile-facts">
            <div>
              <dt><Mail size={14} /> Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt><ShieldCheck size={14} /> Role</dt>
              <dd>{user?.role}</dd>
            </div>
            <div>
              <dt><CalendarDays size={14} /> Member since</dt>
              <dd>{user?.createdAt ? formatDate(user.createdAt) : '-'}</dd>
            </div>
          </dl>
        </section>

        <div className="profile-forms">
          {/* ---------- Personal details ---------- */}
          <section className="section-card">
            <div className="section-card-header">
              <div>
                <h3 className="section-card-title">Personal information</h3>
                <p className="section-card-sub">Your name and phone number appear on records you create.</p>
              </div>
            </div>

            <form className="profile-form" onSubmit={saveDetails} noValidate>
              <div className="profile-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="pf-first">First name *</label>
                  <input id="pf-first" className="form-input" value={details.firstName} onChange={setDetail('firstName')} autoComplete="given-name"
                    aria-invalid={Boolean(detailErrors.firstName)} aria-describedby="pf-first-err" />
                  <FieldError id="pf-first-err" message={detailErrors.firstName} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pf-last">Last name *</label>
                  <input id="pf-last" className="form-input" value={details.lastName} onChange={setDetail('lastName')} autoComplete="family-name"
                    aria-invalid={Boolean(detailErrors.lastName)} aria-describedby="pf-last-err" />
                  <FieldError id="pf-last-err" message={detailErrors.lastName} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pf-phone">Phone number</label>
                  <input id="pf-phone" className="form-input" value={details.phone} onChange={setDetail('phone')} autoComplete="tel" inputMode="tel"
                    placeholder="+91 98200 12345" aria-invalid={Boolean(detailErrors.phone)} aria-describedby="pf-phone-err" />
                  <FieldError id="pf-phone-err" message={detailErrors.phone} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pf-email">Email address</label>
                  <input id="pf-email" className="form-input" value={user?.email || ''} disabled readOnly />
                  <p className="profile-hint">Only an administrator can change your email or role.</p>
                </div>
              </div>

              <div className="profile-form-actions">
                <button type="submit" className="btn btn-primary" disabled={!detailsDirty || savingDetails}>
                  {savingDetails ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  <span>{savingDetails ? 'Saving...' : 'Save changes'}</span>
                </button>
              </div>
            </form>
          </section>

          {/* ---------- Password ---------- */}
          <section className="section-card">
            <div className="section-card-header">
              <div>
                <h3 className="section-card-title">Change password</h3>
                <p className="section-card-sub">Changing it signs you out of every other device.</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPasswords((v) => !v)} aria-pressed={showPasswords}>
                {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showPasswords ? 'Hide' : 'Show'}</span>
              </button>
            </div>

            <form className="profile-form" onSubmit={savePassword} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="pw-current">Current password *</label>
                <input id="pw-current" type={passwordType} className="form-input" value={passwords.currentPassword} onChange={setPassword('currentPassword')}
                  autoComplete="current-password" aria-invalid={Boolean(passwordErrors.currentPassword)} aria-describedby="pw-current-err" />
                <FieldError id="pw-current-err" message={passwordErrors.currentPassword} />
              </div>

              <div className="profile-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="pw-new">New password *</label>
                  <input id="pw-new" type={passwordType} className="form-input" value={passwords.newPassword} onChange={setPassword('newPassword')}
                    autoComplete="new-password" aria-invalid={Boolean(passwordErrors.newPassword)} aria-describedby="pw-new-err pw-strength" />
                  <div id="pw-strength" className="strength" data-level={strength} aria-live="polite">
                    <span className="strength-bar"><i /><i /><i /><i /></span>
                    <span className="strength-label">{strength ? STRENGTH_LABEL[strength] : `At least ${MIN_PASSWORD} characters`}</span>
                  </div>
                  <FieldError id="pw-new-err" message={passwordErrors.newPassword} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pw-confirm">Confirm new password *</label>
                  <input id="pw-confirm" type={passwordType} className="form-input" value={passwords.confirmPassword} onChange={setPassword('confirmPassword')}
                    autoComplete="new-password" aria-invalid={Boolean(passwordErrors.confirmPassword)} aria-describedby="pw-confirm-err" />
                  <FieldError id="pw-confirm-err" message={passwordErrors.confirmPassword} />
                </div>
              </div>

              <div className="profile-form-actions">
                <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                  {savingPassword ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                  <span>{savingPassword ? 'Updating...' : 'Update password'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
