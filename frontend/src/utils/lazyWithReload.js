import { lazy } from 'react';

// A tab that was left open while the app was updated still points at the old, now deleted, screen files. The first time such a tab opens a
// screen it has not loaded yet, the browser says it cannot fetch it. Reloading once fetches the new version, which is what the person
// would have to do by hand, so it is done for them. It is done once only: when the reload does not help (the file is really missing, or
// the network is down), the "A new version is available" message is shown instead of reloading again and again.

/** True for the errors browsers give when a screen's file cannot be fetched (Chrome, Firefox and Safari word it differently). */
export const isChunkError = (error) => /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS/i.test(String(error?.message ?? error));

export const RELOAD_KEY = 'crm-chunk-reload-at';
export const RELOAD_WINDOW_MS = 30_000;

/**
 * Whether the page may reload itself now, and if so remembers it (in this tab only). False when it already did within the last
 * RELOAD_WINDOW_MS, or when it cannot remember (storage blocked): without a memory it could not stop a loop.
 */
export const mayReloadNow = (now = Date.now(), storage = typeof window !== 'undefined' ? window.sessionStorage : null) => {
  try {
    const last = Number(storage.getItem(RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
};

/**
 * `lazy()` for a screen, that reloads the page once when the screen's file is gone (see above). `options` is for tests.
 */
export const lazyWithReload = (importer, options = {}) =>
  lazy(() =>
    importer().catch((error) => {
      const reload = options.reload || (() => window.location.reload());
      if (isChunkError(error) && mayReloadNow(options.now, options.storage)) {
        reload();
        return new Promise(() => {}); // the page is going away: show the loader until it does, not an error
      }
      throw error;
    })
  );
