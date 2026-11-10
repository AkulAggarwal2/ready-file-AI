import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, preferredTheme } from './ui/ThemeToggle';
import './styles.css';

// Before the first render, so the page never flashes the other theme.
applyTheme(preferredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
