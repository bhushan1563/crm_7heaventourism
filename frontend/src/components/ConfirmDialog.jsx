import React from 'react';
import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  isLoading = false
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="460px">
      <div style={{ textAlign: 'center', padding: '10px 0 20px 0' }}>
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: isDanger ? '#FEE2E2' : '#FEF3C7',
            color: isDanger ? '#DC2626' : '#D97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto'
          }}
        >
          <AlertTriangle size={28} />
        </div>
        <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.5', fontWeight: 500 }}>
          {message}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-outline"
          disabled={isLoading}
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : confirmText}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
