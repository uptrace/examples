import { defineConfig, devices } from '@playwright/test'

// Drives the running app and asserts on what it exposed to the page
// (window.__signals / window.recordedTransactions). The webServer runs the Vite
// dev server, which also serves the /api/* endpoints the HTTP panel calls.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    // A dummy DSN, not a credential: nothing listens at that host, and tests that
    // read envelopes intercept them in the browser. But it must be set — with no
    // DSN the SDK is disabled and mints no spans, trace ids or envelopes at all.
    env: {
      VITE_SENTRY_DSN: 'http://testtoken@127.0.0.1:14318/1',
      VITE_UPTRACE_URL: 'http://127.0.0.1:14318',
    },
  },
})
