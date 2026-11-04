import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { firstName: 'A', lastName: 'B', role: 'Admin' }, logout: vi.fn() }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }) }));
vi.mock('./Avatar', () => ({ default: () => <span /> }));
import Navbar from './Navbar';

afterEach(cleanup);
const at = (path) => render(<MemoryRouter initialEntries={[path]}><Navbar onToggleSidebar={() => {}} /></MemoryRouter>);

describe('the Back button of the top bar', () => {
  it('is on the pages that have no back link of their own', () => {
    for (const path of ['/quotations', '/hotels', '/confirmations', '/profile', '/rights', '/no-such-page']) {
      at(path);
      expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
      cleanup();
    }
  });

  it('is not doubled on the home page or on pages with their own back link', () => {
    for (const path of ['/dashboard', '/quotations/new', '/hotels/abc/edit', '/hotels/find', '/hotels/found/x', '/confirmations/c1']) {
      at(path);
      expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
      cleanup();
    }
  });
});
