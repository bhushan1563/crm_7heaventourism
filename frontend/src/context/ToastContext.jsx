import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
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
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '420px',
        pointerEvents: 'none'
      }}>
        {toasts.map((toast) => {
          let bg = '#1e293b';
          let border = 'rgba(255,255,255,0.1)';
          let icon = <Info size={18} color="#38bdf8" />;
          let accent = '#38bdf8';

          if (toast.type === 'success') {
            bg = 'rgba(15, 23, 42, 0.95)';
            border = 'rgba(16, 185, 129, 0.4)';
            icon = <CheckCircle2 size={18} color="#10b981" />;
            accent = '#10b981';
          } else if (toast.type === 'error') {
            bg = 'rgba(15, 23, 42, 0.95)';
            border = 'rgba(244, 63, 94, 0.4)';
            icon = <AlertCircle size={18} color="#f43f5e" />;
            accent = '#f43f5e';
          } else if (toast.type === 'warning') {
            bg = 'rgba(15, 23, 42, 0.95)';
            border = 'rgba(245, 158, 11, 0.4)';
            icon = <AlertTriangle size={18} color="#f59e0b" />;
            accent = '#f59e0b';
          }

          return (
            <div
              key={toast.id}
              className="animate-fade-in"
              style={{
                pointerEvents: 'auto',
                background: bg,
                backdropFilter: 'blur(12px)',
                border: `1px solid ${border}`,
                borderLeft: `4px solid ${accent}`,
                borderRadius: '10px',
                padding: '12px 16px',
                color: '#f8fafc',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                minWidth: '280px'
              }}
            >
              <div style={{ flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1, fontWeight: 500 }}>{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
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
