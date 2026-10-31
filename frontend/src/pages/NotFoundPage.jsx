import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px'
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'var(--bg-EFF6FF)',
          color: 'var(--fg-2563EB)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px'
        }}
      >
        <Compass size={36} />
      </div>
      <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--fg-0F172A)', marginBottom: '8px', fontFamily: 'var(--font-headline)' }}>
        404 - Page Not Found
      </h2>
      <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
        <ArrowLeft size={16} />
        <span>Return to Dashboard</span>
      </button>
    </div>
  );
};

export default NotFoundPage;
