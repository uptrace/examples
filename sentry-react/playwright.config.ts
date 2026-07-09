import { defineConfig, devices } from '@playwright/test'

// Drives the running app and asserts on what it exposed to the page
// (window.__signals / window.recordedTransactions), so tests need no Sentry
// credentials. The webServer runs the Vite dev server, which also serves the
// /api/* endpoints the HTTP panel calls.
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
  },
})
