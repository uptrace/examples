import { defineConfig } from '@playwright/test'

// The specs read the Sentry envelopes the app sends, intercepted in the browser.
export default defineConfig({
  testDir: './tests',
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    // The dev server also serves the /api/* endpoints the HTTP panel calls.
    command: 'npm run dev -- --port 5173 --strictPort',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    // A dummy DSN, not a credential: nothing listens at that host. But it must be
    // set — with no DSN the SDK is disabled and mints no spans, trace ids or
    // envelopes at all, which is what these specs read.
    env: {
      VITE_SENTRY_DSN: 'http://testtoken@127.0.0.1:14318/1',
      VITE_UPTRACE_URL: 'http://127.0.0.1:14318',
    },
  },
})
