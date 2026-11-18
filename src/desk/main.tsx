import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/literata/400.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DeskApp } from './DeskApp';
import './desk.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeskApp />
  </StrictMode>,
);
