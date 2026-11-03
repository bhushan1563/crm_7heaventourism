import React, { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { RELOAD_KEY, RELOAD_WINDOW_MS, isChunkError, lazyWithReload, mayReloadNow } from './lazyWithReload';
import ErrorBoundary from '../components/ErrorBoundary';

afterEach(cleanup);

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};
const Screen = () => <div>The visas screen</div>;
const chunkFailure = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://x/assets/VisaListPage-abc123.js'));

const show = (importer, options) => {
  const Lazy = lazyWithReload(importer, options);
  return render(
    <ErrorBoundary>
      <Suspense fallback={<div>Loading…</div>}>
        <Lazy />
      </Suspense>
    </ErrorBoundary>
  );
};

describe('isChunkError: the ways a browser says a screen file is gone', () => {
  it('knows Chrome, Firefox and Safari wording, and a failed stylesheet', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/a.js',
      'error loading dynamically imported module: https://x/a.js',
      'Importing a module script failed.',
      'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
      'Loading chunk 12 failed.',
      'Loading CSS chunk 3 failed.',
      'Unable to preload CSS for /assets/VisaListPage-CTctKfUn.css'
    ]) expect(isChunkError(new TypeError(message)), message).toBe(true);
  });

  it('does not take any other error for it', () => {
    for (const error of [new Error('Cannot read properties of undefined'), new Error('Network Error'), null, undefined, {}]) expect(isChunkError(error)).toBe(false);
  });
});

describe('mayReloadNow: at most once in a while, and never without a memory', () => {
  it('allows the first reload and remembers it', () => {
    const storage = memory();
    expect(mayReloadNow(1_000_000, storage)).toBe(true);
    expect(storage.data[RELOAD_KEY]).toBe('1000000');
  });

  it('refuses a second reload soon after, and allows one again later', () => {
    const storage = memory();
    expect(mayReloadNow(1_000_000, storage)).toBe(true);
    expect(mayReloadNow(1_000_000 + RELOAD_WINDOW_MS - 1, storage)).toBe(false);
    expect(mayReloadNow(1_000_000 + RELOAD_WINDOW_MS, storage)).toBe(true);
  });

  it('refuses when the memory cannot be used (blocked storage), because a loop could not be stopped', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(mayReloadNow(1, blocked)).toBe(false);
    expect(mayReloadNow(1, null)).toBe(false);
  });

  it('ignores a damaged memory', () => {
    expect(mayReloadNow(5_000_000, memory({ [RELOAD_KEY]: 'banana' }))).toBe(true);
  });
});

describe('lazyWithReload: a screen whose file is gone after an update', () => {
  it('shows the screen when it loads', async () => {
    const reload = vi.fn();
    show(() => Promise.resolve({ default: Screen }), { reload, storage: memory() });
    expect(await screen.findByText('The visas screen')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads the page once, and keeps showing the loader while it does, not an error', async () => {
    const reload = vi.fn();
    const storage = memory();
    show(chunkFailure, { reload, storage });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(storage.data[RELOAD_KEY]).toBeDefined();
  });

  it('when the reload did not help it says so instead of reloading again and again', async () => {
    const reload = vi.fn();
    const storage = memory({ [RELOAD_KEY]: String(Date.now()) }); // it reloaded a moment ago
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    show(chunkFailure, { reload, storage });
    expect(await screen.findByText('A new version is available')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Reload/ })).toBeInTheDocument();
    quiet.mockRestore();
  });

  it('never reloads for an error that is not a missing file: the usual error screen shows', async () => {
    const reload = vi.fn();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    show(() => Promise.reject(new Error('Something else broke')), { reload, storage: memory() });
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});
