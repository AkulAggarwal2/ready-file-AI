import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Section 8: no analytics, trackers, external fonts, or CDN calls. In production
// builds, a Content Security Policy makes the browser refuse any request to
// another site. It is left out in development because the dev server needs
// its own live-reload connection.
const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'none'",
      "font-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; ');
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
};

export default defineConfig({
  plugins: [react(), contentSecurityPolicy],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
