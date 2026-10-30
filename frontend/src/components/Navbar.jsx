import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ScanLine, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ onToggleSidebar }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/guests')) return 'Guest Inquiries & Leads';
    if (path.startsWith('/suppliers')) return 'Supplier Directory (5 Categories)';
    if (path.startsWith('/users')) return 'User & Staff Management';
    if (path.startsWith('/rights')) return 'Access Rights & Security Matrix';
    if (path.startsWith('/scanner')) return 'Mobile Scanner & Visiting Card OCR';
    return 'Executive Dashboard Overview';
  };

  return (
    <header
      style={{
        height: '70px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
      }}
    >
      {/* Left side: Mobile toggle + Page Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748B',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Toggle Sidebar"
        >
          <Menu size={20} />
        </button>

        <div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {getPageTitle()}
          </h1>
          <div style={{ fontSize: '0.725rem', color: '#64748B', fontWeight: 500 }}>
            7Heaven Tourism • Real-time Synchronized
          </div>
        </div>
      </div>

      {/* Right side: Quick Scanner + User Role Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button
          onClick={() => navigate('/scanner')}
          className="btn btn-secondary btn-sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600
          }}
        >
          <ScanLine size={15} color="#2563EB" />
          <span>Scan Card / Doc</span>
        </button>

        {/* User Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '5px 12px',
            borderRadius: '9999px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0'
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#2563EB',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {user?.firstName ? user.firstName[0] : 'A'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.1 }}>
              {user ? `${user.firstName} ${user.lastName}` : 'Admin'}
            </span>
            <span style={{ fontSize: '0.675rem', color: '#64748B', fontWeight: 500 }}>
              {user?.role || 'Administrator'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
