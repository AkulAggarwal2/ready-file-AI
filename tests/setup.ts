import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no popover support. Tests read data-popover-open to see if one is showing.
HTMLElement.prototype.showPopover = function () {
  this.dataset.popoverOpen = '';
};
HTMLElement.prototype.hidePopover = function () {
  delete this.dataset.popoverOpen;
};

afterEach(() => {
  cleanup();
  // The theme lives on <html>, which outlasts each test's render.
  delete document.documentElement.dataset.theme;
});
