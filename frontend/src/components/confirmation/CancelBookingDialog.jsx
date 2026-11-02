import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import { CONFIRMATION_LIMITS } from '../../utils/confirmation';
import './confirmation.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * Asks why a booking is being cancelled (a reason is required, and is kept with the record) and says what will happen.
 * `onConfirm(reason)` is called with the trimmed reason.
 */
export const CancelBookingDialog = ({ confirmation, isOpen, onClose, onConfirm, busy = false }) => {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setTouched(false);
    }
  }, [isOpen, confirmation?._id]);

  if (!confirmation) return null;
  const missing = !reason.trim();
  const received = Number(confirmation.payment?.received) || 0;

  const submit = () => {
    setTouched(true);
    if (!missing) onConfirm(reason.trim());
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title="Cancel this booking?" subtitle={`${confirmation.confirmationNo} · ${confirmation.clientName} · ${confirmation.destination}`} maxWidth="540px">
      <div className="cf-dialog">
        {received > 0 && (
          <div className="itin-alert cf-alert-warn" role="alert" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{money(received)} has been received for this booking. Cancelling does not change or refund payments; please settle that separately.</span>
          </div>
        )}
        <p style={{ margin: 0, fontWeight: 600 }}>This will:</p>
        <ul className="cf-dialog-list">
          <li>cancel the booking (the record stays, marked as cancelled, and can no longer be changed)</li>
          <li>unlock quotation {confirmation.quotationNo} so it can be edited and confirmed again</li>
          {confirmation.previousGuestStatus && <li>put the guest back to “{confirmation.previousGuestStatus}”, unless their status has moved on</li>}
        </ul>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label" htmlFor="cancel-reason">Why is it being cancelled? *</label>
          <textarea id="cancel-reason" className="form-textarea" rows={3} maxLength={CONFIRMATION_LIMITS.reason} value={reason} disabled={busy} placeholder="e.g. Client postponed the trip to next year" aria-invalid={touched && missing} aria-describedby={touched && missing ? 'cancel-reason-error' : undefined} onChange={(e) => setReason(e.target.value)} />
          {touched && missing && <p className="field-error" id="cancel-reason-error" role="alert">Please enter a reason for cancelling.</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Keep the booking
          </button>
          <button type="button" className="btn btn-danger" onClick={submit} disabled={busy}>
            {busy ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CancelBookingDialog;
