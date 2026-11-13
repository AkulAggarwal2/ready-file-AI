import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Section 8: no analytics, trackers, external fonts, or CDN calls. In production
// builds, a Content Security Policy makes the browser refuse any request to
// another site. It is left out in development because the dev server needs
// its own live-reload connection.
//
// Both pages get the same policy, with one difference: ReadyFile Desk loads its
// own self-hosted font files (Public Sans and Literata, from @fontsource), so
// desk.html allows fonts from the same site. ReadyFile loads no fonts at all.
function policyFor(page: 'readyfile' | 'desk'): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'none'",
    page === 'desk' ? "font-src 'self'" : "font-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml(html, context) {
    const page = context.filename.replace(/\\/g, '/').endsWith('/desk.html') ? 'desk' : 'readyfile';
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policyFor(page)}" />`,
    );
  },
};

export default defineConfig({
  plugins: [react(), contentSecurityPolicy],
  build: {
    rolldownOptions: {
      // Two pages from one app: ReadyFile (index.html) and ReadyFile Desk (desk.html).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        desk: fileURLToPath(new URL('./desk.html', import.meta.url)),
      },
    },
    // Font files stay separate files. Inlined as data: addresses, the
    // font-src 'self' policy would block them.
    assetsInlineLimit: (filePath) => (/\.woff2?$/.test(filePath) ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
