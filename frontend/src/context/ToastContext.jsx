import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // Errors and warnings stay longer: they are usually longer sentences and need to be read.
  const showToast = useCallback((message, type = 'info', duration) => {
    if (duration === undefined) duration = type === 'error' ? 7000 : type === 'warning' ? 5500 : 3500;
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Render Container */}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => {
          let bg = 'var(--surface)';
          let border = 'var(--border-color)';
          let icon = <Info size={18} color="#38bdf8" />;
          let accent = '#2E90FA';

          if (toast.type === 'success') {
            bg = 'var(--surface)';
            border = 'var(--border-color)';
            icon = <CheckCircle2 size={18} color="#10b981" />;
            accent = '#12B76A';
          } else if (toast.type === 'error') {
            bg = 'var(--surface)';
            border = 'var(--border-color)';
            icon = <AlertCircle size={18} color="#f43f5e" />;
            accent = '#F04438';
          } else if (toast.type === 'warning') {
            bg = 'var(--surface)';
            border = 'var(--border-color)';
            icon = <AlertTriangle size={18} color="#f59e0b" />;
            accent = '#F79009';
          }

          return (
            <div
              key={toast.id}
              className="toast-item animate-fade-in"
              style={{
                background: bg,
                border: `1px solid ${border}`,
                borderLeft: `4px solid ${accent}`
              }}
            >
              <div style={{ flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1, fontWeight: 500 }}>{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex'
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
