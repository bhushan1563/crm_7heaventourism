import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ScanLine, Menu, Sun, Moon, ChevronDown, UserRound, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';

// [path prefix, section, page title]
const PAGES = [
  ['/guests', 'Sales', 'Guest Inquiries & Leads'],
  ['/quotations', 'Sales', 'Quotations & Itineraries'],
  ['/confirmations', 'Sales', 'Booking Confirmations'],
  ['/hotels', 'Sales', 'Hotel List'],
  ['/itineraries', 'Sales', 'Itinerary Library'],
  ['/suppliers', 'Operations', 'Supplier Directory'],
  ['/scanner', 'Operations', 'Mobile Scanner & Card OCR'],
  ['/users', 'Administration', 'User & Staff Management'],
  ['/rights', 'Administration', 'Access Rights & Security'],
  ['/profile', 'Account', 'My Profile']
];

export const Navbar = ({ onToggleSidebar, isMenuOpen = false }) => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const menuRef = useRef(null);

  const [, section, title] = PAGES.find(([prefix]) => location.pathname.startsWith(prefix)) || [null, 'Overview', 'Dashboard'];
  const fullName = user ? `${user.firstName} ${user.lastName}` : 'Admin';

  // The profile menu closes on outside click, Escape, and when you navigate.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="app-navbar">
      {/* Left side: the one menu button + page title */}
      <div className="navbar-left">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="navbar-menu-btn"
          aria-label="Toggle navigation menu"
          aria-expanded={isMenuOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={20} />
        </button>

        <div className="navbar-title">
          <div className="navbar-crumb">{section}</div>
          <h1>{title}</h1>
        </div>
      </div>

      {/* Right side: quick scanner, light/dark switch, profile menu */}
      <div className="navbar-right">
        <button
          type="button"
          onClick={() => navigate('/scanner')}
          className="btn btn-secondary btn-sm navbar-scan-btn"
          aria-label="Scan card or document"
        >
          <ScanLine size={15} />
          <span className="navbar-scan-label">Scan Card / Doc</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="navbar-icon-btn"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="navbar-divider" aria-hidden="true" />

        <div className="profile-menu" ref={menuRef}>
          <button
            type="button"
            className="navbar-user-pill"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            <Avatar user={user} size={30} />
            <span className="navbar-user-text">
              <span className="navbar-user-name">{fullName}</span>
              <span className="navbar-user-role">{user?.role || 'Administrator'}</span>
            </span>
            <ChevronDown size={15} className="navbar-user-caret" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div className="profile-dropdown animate-fade-in" role="menu" aria-label="Account">
              <div className="profile-dropdown-head">
                <Avatar user={user} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div className="profile-dropdown-name">{fullName}</div>
                  <div className="profile-dropdown-email">{user?.email}</div>
                </div>
              </div>

              <button type="button" role="menuitem" className="profile-dropdown-item" onClick={() => navigate('/profile')}>
                <UserRound size={16} />
                <span>My Profile</span>
              </button>

              <div className="profile-dropdown-sep" />

              <button
                type="button"
                role="menuitem"
                className="profile-dropdown-item is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmLogout(true);
                }}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        title="Sign Out"
        message="Are you sure you want to sign out from 7Heaven?"
        confirmText="Yes, Sign Out"
        cancelText="Cancel"
        isDanger={true}
      />
    </header>
  );
};

export default Navbar;
