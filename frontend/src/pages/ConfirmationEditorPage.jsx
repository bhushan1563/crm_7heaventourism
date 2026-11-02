import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Ban, Eye, Lock, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import confirmationService from '../services/confirmationService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import PageLoader from '../components/PageLoader';
import BookingEditor from '../components/confirmation/BookingEditor';
import CancelBookingDialog from '../components/confirmation/CancelBookingDialog';
import ConfirmationPreview from '../components/confirmation/ConfirmationPreview';
import { balanceOf, bookingErrors, bookingPayload, firstErrorKey, formFromConfirmation } from '../utils/confirmation';
import { formatDate } from '../utils/dateHelper';
import './itineraries.css';
import '../components/confirmation/confirmation.css';

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

export const ConfirmationEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(() => formFromConfirmation(null));
  const [snapshot, setSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [dialog, setDialog] = useState(null); // 'leave' | 'reload' | 'cancel'
  const [previewing, setPreviewing] = useState(false);
  const heldId = useRef(null);

  const apply = useCallback((data) => {
    heldId.current = data._id;
    const next = formFromConfirmation(data);
    setRecord(data);
    setForm(next);
    setSnapshot(JSON.stringify(bookingPayload(next)));
    setErrors({});
    setServerError('');
    setConflict(false);
  }, []);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await confirmationService.get(id);
      if (res.success) apply(res.data);
      else setLoadError(res.message || 'This confirmation could not be loaded.');
    } catch (err) {
      setLoadError(getErrorMessage(err, 'This confirmation could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id, apply]);

  useEffect(() => {
    if (heldId.current !== id) loadRecord();
  }, [id, loadRecord]);

  const dirty = useMemo(() => Boolean(record) && JSON.stringify(bookingPayload(form)) !== snapshot, [form, snapshot, record]);

  // The browser's own "leave this page?" prompt covers closing the tab and reloading.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const cancelled = record?.status === 'Cancelled';
  const readOnly = !record || cancelled || !canEditRecord('confirmations', record);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    if (Object.keys(errors).length) setErrors({}); // the next save checks everything again
  };

  const save = async () => {
    const found = bookingErrors(form);
    setErrors(found);
    const count = Object.keys(found).length;
    if (count) {
      showToast(count === 1 ? 'Please fix the highlighted field before saving.' : `Please fix the ${count} highlighted fields before saving.`, 'warning');
      const key = firstErrorKey(found, form);
      if (key) document.getElementById(key)?.focus();
      return;
    }
    setSaving(true);
    setServerError('');
    try {
      const res = await confirmationService.update(id, { ...bookingPayload(form), updatedAt: record.updatedAt });
      if (res.success) {
        showToast(res.message || 'Booking details saved.', 'success');
        apply(res.data);
      } else {
        setServerError(res.message || 'The booking details could not be saved.');
        if (/while you were editing/i.test(res.message || '')) setConflict(true);
        showToast(res.message || 'The booking details could not be saved.', 'error');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'The booking details could not be saved. Your changes are still on this page; please try again.');
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelBooking = async (reason) => {
    setCancelling(true);
    try {
      const res = await confirmationService.cancel(id, reason);
      if (res.success) {
        showToast(res.message || 'The booking was cancelled.', 'success');
        apply(res.data);
        setDialog(null);
      } else {
        showToast(res.message || 'The booking could not be cancelled.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'The booking could not be cancelled.'), 'error');
    } finally {
      setCancelling(false);
    }
  };

  const goBack = () => (dirty ? setDialog('leave') : navigate('/confirmations'));

  if (loading) return <PageLoader label="Loading the booking…" />;
  if (loadError || !record) {
    return (
      <div className="itin-state" role="alert">
        <AlertCircle size={32} aria-hidden="true" />
        <h3>This booking cannot be opened</h3>
        <p>{loadError || 'It could not be loaded.'}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/confirmations')}>
            <ArrowLeft size={14} /> Back to confirmations
          </button>
          <button type="button" className="btn btn-outline" onClick={loadRecord}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const balance = balanceOf(form.payment);
  const lockedForYou = !cancelled && !canEditRecord('confirmations', record);

  return (
    <div className="itin-page itin-editor">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <button type="button" className="itin-back" onClick={goBack}>
            <ArrowLeft size={14} /> Confirmations
          </button>
          <div className="page-title-row">
            <h2 className="page-title">{record.confirmationNo}</h2>
            <span className={`cf-badge ${cancelled ? 'is-cancelled' : 'is-confirmed'}`}>{record.status}</span>
            {dirty && <span className="itin-dirty">Unsaved changes</span>}
          </div>
          <p className="page-subtitle">{record.clientName} · {record.destination}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline-azure" onClick={() => setPreviewing(true)}>
            <Eye size={15} /> <span>Preview &amp; PDF</span>
          </button>
          {!cancelled && !readOnly && can('confirmations', 'canUpdate') && (
            <button type="button" className="btn btn-outline cf-cancel-btn" onClick={() => setDialog('cancel')}>
              <Ban size={15} /> <span>Cancel booking</span>
            </button>
          )}
        </div>
      </div>

      {cancelled && (
        <div className="cf-banner is-cancelled" role="status">
          <Ban size={16} aria-hidden="true" />
          <span>
            Cancelled{record.cancelledAt ? ` on ${formatDate(record.cancelledAt)}` : ''}{record.cancelledByName ? ` by ${record.cancelledByName}` : ''}: {record.cancelReason}. This record is kept for reference and can no longer be changed.
          </span>
        </div>
      )}
      {lockedForYou && (
        <div className="itin-alert" role="status">
          <Lock size={16} aria-hidden="true" />
          <span>Confirmed bookings can only be changed by the people assigned to them, or an Admin. You can look at everything here.</span>
        </div>
      )}
      {serverError && (
        <div className="itin-alert cf-alert-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{serverError}</span>
          {conflict && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog('reload')}>
              <RefreshCw size={13} /> Load the latest version
            </button>
          )}
        </div>
      )}

      <dl className="glass-panel cf-summary">
        <div><dt>Client</dt><dd>{record.clientName}</dd></div>
        <div><dt>Guests</dt><dd>{record.paxDetails || '–'}</dd></div>
        <div><dt>Destination</dt><dd>{record.destination}{record.optionName ? ` (${record.optionName})` : ''}</dd></div>
        <div><dt>Quotation</dt><dd>{can('quotations', 'canRead') ? <Link to={`/quotations/${record.quotationId}/edit`}>{record.quotationNo}</Link> : record.quotationNo}</dd></div>
        <div><dt>Total</dt><dd>{money(form.payment.totalAmount)}</dd></div>
        <div><dt>Received</dt><dd>{money(form.payment.received)}</dd></div>
        <div><dt>Balance</dt><dd className={balance > 0 ? 'cf-owing' : 'cf-clear'}>{balance > 0 ? money(balance) : (Number(form.payment.totalAmount) || 0) > 0 ? 'Fully paid' : '–'}</dd></div>
        <div><dt>Confirmed</dt><dd>{record.confirmedAt ? formatDate(record.confirmedAt) : '–'}{record.createdByName ? ` by ${record.createdByName}` : ''}</dd></div>
      </dl>

      <BookingEditor form={form} errors={errors} onChange={set} readOnly={readOnly} />

      <div className="edit-bar" role="region" aria-label="Save">
        <span className={`edit-bar-status${dirty ? ' is-dirty' : ''}`}>{dirty ? 'You have unsaved changes' : readOnly ? 'Read only' : 'All changes saved'}</span>
        <button type="button" className="btn btn-outline" onClick={goBack}>
          {dirty ? 'Cancel' : 'Back to the list'}
        </button>
        {!readOnly && (
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>

      <ConfirmationPreview confirmation={record} form={form} isOpen={previewing} onClose={() => setPreviewing(false)} />
      <CancelBookingDialog confirmation={record} isOpen={dialog === 'cancel'} onClose={() => setDialog(null)} onConfirm={cancelBooking} busy={cancelling} />
      <ConfirmDialog
        isOpen={dialog === 'leave'}
        onClose={() => setDialog(null)}
        onConfirm={() => navigate('/confirmations')}
        isDanger
        title="Leave without saving?"
        message="You have changes that are not saved. If you leave now they will be lost."
        confirmText="Leave without saving"
        cancelText="Keep editing"
      />
      <ConfirmDialog
        isOpen={dialog === 'reload'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          loadRecord();
        }}
        isDanger
        title="Load the latest version?"
        message="Someone else saved this booking while you were editing. Loading their version replaces what is on this page, including your unsaved changes."
        confirmText="Load the latest version"
        cancelText="Keep my version"
      />
    </div>
  );
};

export default ConfirmationEditorPage;
