// Sentry initialization for the browser.
//
// This file is imported FIRST in main.tsx (before React) so that Sentry can
// install its instrumentation before the app starts rendering.
//
// The DSN is read from the `VITE_SENTRY_DSN` environment variable. Copy
// `.env.example` to `.env` and paste the Sentry DSN from your Uptrace project
// (Project -> DSN -> "Sentry" tab). See README.md for details.
import * as Sentry from '@sentry/react'

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

  // browserTracingIntegration emits performance spans for page loads,
  // navigations and fetch/XHR requests. Together with the manual spans in
  // App.tsx these show up as traces in Uptrace.
  integrations: [Sentry.browserTracingIntegration()],

  // Sample 100% of traces. Lower this in production; for a demo we want to
  // see every interaction in Uptrace.
  tracesSampleRate: 1.0,

  // Attach a default user/IP so events are easier to find in the UI. Turn
  // this off if you do not want to send personally identifiable information.
  sendDefaultPii: true,

  // Surfaces as an attribute on every event so you can filter this example's
  // data in Uptrace.
  environment: 'development',
})
