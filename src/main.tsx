import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './ui/ThemeToggle';
import './styles.css';

// Every visit starts in light mode (Shark Tank feedback: easier for people who
// don't use dark mode). Set before the first render, so the page never flashes.
applyTheme('light');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
