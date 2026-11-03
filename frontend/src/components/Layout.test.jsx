import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('./Sidebar', () => ({ default: () => <nav>sidebar</nav> }));
vi.mock('./Navbar', () => ({ default: () => <header>navbar</header> }));
import Layout from './Layout';

// On a phone the page itself must never scroll: the app scrolls inside its own content area. Otherwise the whole page slid up under the
// top bar and left a blank band at the bottom.

afterEach(cleanup);
const here = path.dirname(fileURLToPath(import.meta.url));
const css = (name) => fs.readFileSync(path.join(here, '..', name), 'utf8');

describe('the app shell on a phone', () => {
  it('marks the page while the app is on screen, and lets go of it afterwards (the login page scrolls normally)', () => {
    const { unmount } = render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(document.documentElement.classList.contains('app-shell-active')).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains('app-shell-active')).toBe(false);
  });

  it('has the style rules that keep the page from scrolling and from being taller than the visible screen', () => {
    const layout = css('layout.css');
    expect(layout).toMatch(/html\.app-shell-active,\s*html\.app-shell-active body\s*\{[^}]*overflow:\s*hidden/);
    expect(layout).toMatch(/\.app-shell\s*\{[^}]*height:\s*100dvh[^}]*position:\s*relative/s); // the positioned parent: a hidden element deep in a long page cannot stretch the page
    expect(css('index.css')).toMatch(/min-height:\s*100vh;\s*min-height:\s*100dvh;/); // the body is the visible height, not the height behind the address bar
  });

  it('lets the save bar reach down to the bottom edge of the screen instead of floating above the content padding', () => {
    expect(css('layout.css')).toMatch(/--content-pad-bottom:/);
    expect(css(path.join('pages', 'itineraries.css'))).toMatch(/\.edit-bar\s*\{\s*bottom:\s*calc\(var\(--content-pad-bottom, 0px\) \* -1\);\s*\}/);
  });
});
