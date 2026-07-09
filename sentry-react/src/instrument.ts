// Sentry initialization for the browser.
//
// This file is imported FIRST in main.tsx (before React) so Sentry installs its
// instrumentation before the app renders.
//
// The DSN is read from `VITE_SENTRY_DSN`. Copy `.env.example` to `.env` and
// paste the Sentry DSN from your Uptrace project. See README.md for details.
import * as Sentry from '@sentry/react'
import { makeReportingTransport } from './delivery'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (!dsn) {
  // Make the misconfiguration loud instead of silently dropping every event.
  console.warn(
    'VITE_SENTRY_DSN is not set. Copy .env.example to .env and paste your ' +
      'Uptrace Sentry DSN, then restart `npm run dev`.',
  )
}

Sentry.init({
  dsn,

  // Wrap the standard fetch transport so the UI can show whether each envelope
  // actually reached the ingest server (see src/delivery.ts and the delivery
  // status line in the UI). It only observes; it does not change delivery.
  transport: makeReportingTransport,

  // browserTracingIntegration opens a pageload trace on load and captures
  // fetch/XHR and page-load timing spans under it. This is the only place traces
  // are started — the app never calls startNewTrace; spans/logs/errors attach to
  // the current page's trace.
  integrations: [Sentry.browserTracingIntegration()],

  // Send structured logs (Sentry.logger.*) to Uptrace, used for add/delete.
  enableLogs: true,

  // Sample 100% of traces. Lower this in production; for a demo we want to see
  // every interaction in Uptrace.
  tracesSampleRate: 1.0,

  // Attach a default user/IP so events are easier to find. Turn off if you do
  // not want to send personally identifiable information.
  sendDefaultPii: true,

  // Surfaces as an attribute on every event so you can filter this example's
  // data in Uptrace.
  environment: 'development',
})
