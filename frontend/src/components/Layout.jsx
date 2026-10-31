import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import ErrorBoundary from './ErrorBoundary';
import PageLoader from './PageLoader';
import { useMediaQuery, MOBILE_NAV_QUERY } from '../hooks/useMediaQuery';

export const Layout = () => {
  const location = useLocation();
  const isMobile = useMediaQuery(MOBILE_NAV_QUERY);
  const [isCollapsed, setIsCollapsed] = useState(false); // desktop: icons-only sidebar
  const [mobileOpen, setMobileOpen] = useState(false); // phone / tablet: drawer

  // The drawer closes whenever you navigate, or when the window grows into the desktop layout.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const toggleSidebar = () => {
    if (isMobile) setMobileOpen((open) => !open);
    else setIsCollapsed((collapsed) => !collapsed);
  };

  return (
    <div className="app-shell">
      <Sidebar
        isCollapsed={isCollapsed && !isMobile}
        isMobile={isMobile}
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {isMobile && mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <div className="app-main">
        <Navbar onToggleSidebar={toggleSidebar} isMenuOpen={isMobile ? mobileOpen : !isCollapsed} />
        <main className="app-content" id="main-content">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default Layout;
