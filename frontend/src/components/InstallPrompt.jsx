import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// Shows a "Add to Home Screen" banner on mobile devices.
// Android Chrome fires beforeinstallprompt; iOS Safari requires a manual share-sheet step, so we show a different hint.

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const isInStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return; // already installed
    try { if (localStorage.getItem('pwa-dismissed') === '1') { setDismissed(true); return; } } catch { /* blocked */ }
    if (isIOS() && /safari/i.test(navigator.userAgent)) {
      setShowIosHint(true);
      return;
    }
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setDeferredPrompt(null);
    setShowIosHint(false);
    setDismissed(true);
    try { localStorage.setItem('pwa-dismissed', '1'); } catch { /* blocked */ }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    else setDeferredPrompt(null);
  };

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div className="pwa-banner" role="banner" aria-label="Install app">
      <Download size={16} aria-hidden="true" />
      {showIosHint ? (
        <span>To install on your phone, tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.</span>
      ) : (
        <span>Add <strong>7Heaven CRM</strong> to your home screen for quick access.</span>
      )}
      {deferredPrompt && <button type="button" className="btn btn-primary btn-sm" onClick={install}>Install</button>}
      <button type="button" className="pwa-banner-close" onClick={dismiss} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
};

export default InstallPrompt;
