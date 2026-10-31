import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = '7heaven_theme';
const THEME_COLOR = { light: '#FFFFFF', dark: '#121B2C' }; // browser / phone status-bar colour

const ThemeContext = createContext(null);

const systemTheme = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const savedTheme = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

/**
 * Light / dark mode. Until the user picks one, the device setting is followed (and tracked live);
 * after that their choice is remembered. public/theme-init.js applies it before first paint to avoid a flash.
 */
export const ThemeProvider = ({ children }) => {
  const [chosen, setChosen] = useState(savedTheme);
  const [system, setSystem] = useState(systemTheme);
  const theme = chosen || system;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);

  // Colour transitions are switched on only after the first paint, so the page never animates in from the wrong theme.
  useEffect(() => {
    const frame = requestAnimationFrame(() => document.documentElement.classList.add('theme-ready'));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => setSystem(event.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setChosen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: the choice just won't persist */
    }
  }, [theme]);

  const value = useMemo(() => ({ theme, isDark: theme === 'dark', toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
