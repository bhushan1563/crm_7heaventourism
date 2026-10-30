import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCog,
  ShieldCheck,
  ScanLine,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
  FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import logo from '../assets/logo.webp';

export const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const handleLogoutConfirm = () => {
    setIsLogoutConfirmOpen(false);
    logout();
  };

  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      module: 'reports'
    },
    {
      to: '/guests',
      label: 'Guest List',
      icon: Users,
      module: 'guest_list',
      badge: 'Inquiries'
    },
    {
      to: '/quotations',
      label: 'Quotations',
      icon: FileText,
      module: 'quotations'
    },
    {
      to: '/suppliers',
      label: 'Supplier List',
      icon: Building2,
      module: 'supplier_list',
      badge: '5 Categories'
    },
    {
      to: '/users',
      label: 'User Management',
      icon: UserCog,
      module: 'users'
    },
    ...(user?.role === 'Admin' || user?.role === 'SuperAdmin'
      ? [
        {
          to: '/rights',
          label: 'Rights & Security',
          icon: ShieldCheck,
          module: 'rights'
        }
      ]
      : []),
    {
      to: '/scanner',
      label: 'Mobile Scanner',
      icon: ScanLine,
      module: 'scanner',
      highlight: true
    }
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? '80px' : '260px',
        height: '100vh',
        background: '#0F172A',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 50,
        overflowX: 'hidden'
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '20px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        {!isCollapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                overflow: 'hidden',
                flexShrink: 0
              }}
            >
              <img src={logo} alt="7Heaven Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-headline)',
                  fontSize: '1rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF'
                }}
              >
                7Heaven Tourism
              </div>
              <div style={{ fontSize: '0.55rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Travel with the Trust
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              overflow: 'hidden'
            }}
          >
            <img src={logo} alt="7Heaven Logo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#94A3B8',
            borderRadius: '8px',
            padding: '5px',
            cursor: 'pointer',
            display: isCollapsed ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Navigation Links */}
      <div style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '11px 14px',
                borderRadius: '10px',
                textDecoration: 'none',
                color: isActive ? '#FFFFFF' : '#94A3B8',
                background: isActive
                  ? '#2563EB'
                  : item.highlight
                    ? 'rgba(38, 198, 218, 0.1)'
                    : 'transparent',
                boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                size={19}
                color={isActive ? '#FFFFFF' : item.highlight ? '#26C6DA' : '#94A3B8'}
                style={{ flexShrink: 0 }}
              />

              {!isCollapsed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>{item.label}</span>
                  {item.highlight ? (
                    <span
                      style={{
                        background: 'rgba(38, 198, 218, 0.2)',
                        color: '#26C6DA',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Sparkles size={10} /> OCR
                    </span>
                  ) : null}
                </div>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* User Info & Logout Footer */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.95)'
        }}
      >
        {!isCollapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2563EB 0%, #0288D1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  flexShrink: 0
                }}
              >
                {user?.firstName ? user.firstName[0] : 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#F8FAFC', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {user ? `${user.firstName} ${user.lastName}` : 'Guest User'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span
                    style={{
                      fontSize: '0.675rem',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: user?.role === 'Admin' ? 'rgba(37, 99, 235, 0.25)' : 'rgba(38, 198, 218, 0.2)',
                      color: user?.role === 'Admin' ? '#93C5FD' : '#80DEEA',
                      fontWeight: 600
                    }}
                  >
                    {user?.role || 'Sales'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsLogoutConfirmOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#EF4444',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                transition: 'opacity 0.2s'
              }}
              title="Sign Out"
            >
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setIsLogoutConfirmOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#EF4444',
                cursor: 'pointer',
                padding: '8px'
              }}
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={handleLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out from 7Heaven?"
        confirmText="Yes, Sign Out"
        cancelText="Cancel"
        isDanger={true}
      />
    </aside>
  );
};

export default Sidebar;
