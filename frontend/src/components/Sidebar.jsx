import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCog,
  ShieldCheck,
  ScrollText,
  ScanLine,
  Sparkles,
  FileText,
  Hotel,
  Route,
  CalendarDays,
  CheckCircle2,
  Contact,
  Stamp,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.webp';

/**
 * Navigation only. Opening / collapsing it is done by the single menu button in the top bar (on a phone this panel also
 * has a close button); the signed-in user, profile and sign-out live in the top bar's account menu.
 */
export const Sidebar = ({ isCollapsed, isMobile = false, isOpen = false, onClose = () => {} }) => {
  const { user } = useAuth();
  const location = useLocation();

  const isAdmin = user?.role === 'Admin' || user?.role === 'SuperAdmin';

  // Same screens and permissions as before, grouped the way CRM workspaces usually are.
  const sections = [
    {
      label: 'Overview',
      items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }]
    },
    {
      label: 'Sales',
      items: [
        { to: '/guests', label: 'Guest List', icon: Users },
        { to: '/clients', label: 'Clients', icon: Contact },
        { to: '/quotations', label: 'Quotations', icon: FileText },
        { to: '/confirmations', label: 'Confirmations', icon: CheckCircle2 },
        { to: '/calendar', label: 'Travel Calendar', icon: CalendarDays },
        { to: '/hotels', label: 'Hotels', icon: Hotel },
        { to: '/visas', label: 'Visas', icon: Stamp },
        { to: '/itineraries', label: 'Itineraries', icon: Route }
      ]
    },
    {
      label: 'Operations',
      items: [
        { to: '/suppliers', label: 'Supplier List', icon: Building2 },
        { to: '/scanner', label: 'Mobile Scanner', icon: ScanLine, tag: 'OCR' }
      ]
    },
    {
      label: 'Administration',
      items: [
        { to: '/users', label: 'User Management', icon: UserCog },
        ...(isAdmin ? [{ to: '/notes-policies', label: 'Notes & Policies', icon: ScrollText }, { to: '/rights', label: 'Rights & Security', icon: ShieldCheck }] : [])
      ]
    }
  ];

  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar${isCollapsed ? ' is-collapsed' : ''}${isOpen ? ' is-open' : ''}`}
      aria-label="Sidebar"
    >
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-main">
          <div className="sidebar-brand-logo">
            <img src={logo} alt="7Heaven Logo" />
          </div>
          {!isCollapsed && (
            <div>
              <div className="sidebar-brand-name">7Heaven Tourism</div>
              <div className="sidebar-brand-tag">Travel with Trust</div>
            </div>
          )}
        </div>

        {isMobile && (
          <button type="button" className="sidebar-icon-btn" onClick={onClose} title="Close menu" aria-label="Close menu" style={{ padding: '9px' }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {sections.map((section) => (
          <React.Fragment key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`sidebar-link${isActive ? ' is-active' : ''}`}
                  onClick={() => isMobile && onClose()}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={isCollapsed ? item.label : undefined}
                >
                  <Icon size={18} className="sidebar-icon" />
                  <span className="sidebar-label">{item.label}</span>
                  {item.tag && (
                    <span className="sidebar-link-tag">
                      <Sparkles size={10} /> {item.tag}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </React.Fragment>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
