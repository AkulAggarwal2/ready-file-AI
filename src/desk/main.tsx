import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts from @fontsource, bundled with the app. Nothing is loaded
// from another site (section 8).
import '@fontsource/public-sans/latin-400.css';
import '@fontsource/public-sans/latin-500.css';
import '@fontsource/public-sans/latin-600.css';
import '@fontsource/public-sans/latin-700.css';
import '@fontsource/literata/latin-400.css';
import { DeskApp } from './DeskApp';
import './desk.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeskApp />
  </StrictMode>,
);
