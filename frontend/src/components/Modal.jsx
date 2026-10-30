import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, subtitle, children, maxWidth = '650px' }) => {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Move focus into the dialog once, when it opens, so keyboard and screen-reader users start inside it.
  // (Separate from the effect above: parents pass a new onClose on every render, which must not steal focus while typing.)
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-dialog animate-fade-in"
        style={{ '--modal-max-width': maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h3 id={titleId} className="modal-title">
              {title}
            </h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-icon btn-outline modal-close" aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
