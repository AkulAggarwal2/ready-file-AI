import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // The theme lives on <html>, which outlasts each test's render.
  delete document.documentElement.dataset.theme;
});
