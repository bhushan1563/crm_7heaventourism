import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ScanLine, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ onToggleSidebar, isMenuOpen = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/guests')) return 'Guest Inquiries & Leads';
    if (path.startsWith('/quotations')) return 'Quotations & Itineraries';
    if (path.startsWith('/suppliers')) return 'Supplier Directory (5 Categories)';
    if (path.startsWith('/users')) return 'User & Staff Management';
    if (path.startsWith('/rights')) return 'Access Rights & Security Matrix';
    if (path.startsWith('/scanner')) return 'Mobile Scanner & Visiting Card OCR';
    return 'Executive Dashboard Overview';
  };

  return (
    <header className="app-navbar">
      {/* Left side: menu toggle + page title */}
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
          <h1>{getPageTitle()}</h1>
          <div className="navbar-subtitle">7Heaven Tourism • Real-time Synchronized</div>
        </div>
      </div>

      {/* Right side: quick scanner + user pill */}
      <div className="navbar-right">
        <button
          type="button"
          onClick={() => navigate('/scanner')}
          className="btn btn-secondary btn-sm navbar-scan-btn"
          aria-label="Scan card or document"
        >
          <ScanLine size={15} color="#2563EB" />
          <span className="navbar-scan-label">Scan Card / Doc</span>
        </button>

        <div className="navbar-user-pill">
          <div className="navbar-avatar" aria-hidden="true">
            {user?.firstName ? user.firstName[0] : 'A'}
          </div>
          <div className="navbar-user-text">
            <span className="navbar-user-name">{user ? `${user.firstName} ${user.lastName}` : 'Admin'}</span>
            <span className="navbar-user-role">{user?.role || 'Administrator'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
