import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Section 8: no analytics, trackers, external fonts, or CDN calls. In production
// builds, a Content Security Policy makes the browser refuse any request to
// another site. It is left out in development because the dev server needs
// its own live-reload connection.
// Desk (desk.html) self-hosts its fonts, so only its policy allows fonts from
// this site. ReadyFile's policy still blocks fonts entirely.
const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml(html, ctx) {
    const isDesk = ctx.path.endsWith('desk.html');
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'none'",
      isDesk ? "font-src 'self'" : "font-src 'none'",
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
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        desk: resolve(import.meta.dirname, 'desk.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
