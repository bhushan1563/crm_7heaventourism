import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F172A',
          color: '#2563EB'
        }}
      >
        <div style={{ fontSize: '2rem', fontFamily: 'var(--font-headline)', fontWeight: 800, color: '#FFFFFF', marginBottom: '12px' }}>
          7Heaven
        </div>
        <div style={{ fontSize: '0.875rem', color: '#94A3B8' }}>
          Verifying security authorization...
        </div>
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
