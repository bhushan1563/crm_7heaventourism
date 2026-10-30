import React from 'react';

/** Lightweight loading state shown while a screen's code (or the session check) is loading. */
export const PageLoader = ({ fullScreen = false, label = 'Loading…' }) => (
  <div className={`page-loader${fullScreen ? ' page-loader-full' : ''}`} role="status" aria-live="polite">
    <div className="page-loader-spinner" aria-hidden="true" />
    <span className="page-loader-label">{label}</span>
  </div>
);

export default PageLoader;
