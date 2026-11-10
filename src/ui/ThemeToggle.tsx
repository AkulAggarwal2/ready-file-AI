import { useState } from 'react';
import { copy } from '../content';

export type Theme = 'light' | 'dark';

/** The device setting. jsdom has no matchMedia, so tests start in light mode. */
export function preferredTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches the color tokens in styles.css and the browser's address bar color. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}

// The choice is kept in memory only (no storage, section 8), so each visit
// starts from the device setting.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const dark = theme === 'dark';

  function toggle() {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button type="button" role="switch" aria-checked={dark} className="theme-toggle" onClick={toggle}>
      <span className="sr-only">{copy.theme.label}</span>
      <span className="theme-track" aria-hidden="true">
        <span className="theme-thumb">
          {dark ? (
            <svg viewBox="0 0 16 16">
              <path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
            </svg>
          )}
        </span>
      </span>
    </button>
  );
}
