// Sentry initialization for the browser. Imported FIRST in main.tsx so Sentry
// installs its instrumentation before React renders.
//
// The DSN is read from `VITE_SENTRY_DSN`. Copy `.env.example` to `.env` and
// paste the Sentry DSN from your Uptrace project. See README.md for details.
import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom'
import { makeReportingTransport } from './delivery'
import { installPageRootTracking } from './telemetry'

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
  // actually reached the ingest server (see src/delivery.ts). It only observes.
  transport: makeReportingTransport,

  // React Router v7 tracing: opens a pageload trace on load and a navigation
  // trace on each route change, named by the parameterized route (/item/:id).
  // This is the only place traces are started — signals attach to the current
  // trace; the app never calls startNewTrace.
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],

  // Send structured logs (Sentry.logger.*) to Uptrace, used by the Logs panel.
  enableLogs: true,

  // Sample 100% of traces. Lower this in production; for a demo we want to see
  // every interaction in Uptrace.
  tracesSampleRate: 1.0,

  // Attach a default user/IP so events are easier to find. Turn off to avoid PII.
  sendDefaultPii: true,

  // Surfaces as an attribute on every event so you can filter this example's data.
  environment: 'development',
})

// Track the pageload/navigation root span so telemetry.ts can nest interactions
// under it (Uptrace shows only one root per trace). Installed here, right after
// init: its spanStart listener catches later navigation spans, and it also seeds
// the root from the still-active span to catch the initial pageload span, which
// already started (synchronously, inside Sentry.init) before the listener could
// see it.
installPageRootTracking()

// Record pageload/navigation transaction event ids so end-to-end tests can
// assert a new trace was created on navigation.
Sentry.addEventProcessor(event => {
  if (
    event.type === 'transaction' &&
    (event.contexts?.trace?.op === 'pageload' || event.contexts?.trace?.op === 'navigation')
  ) {
    const id = event.event_id
    if (id) {
      window.recordedTransactions = window.recordedTransactions || []
      window.recordedTransactions.push(id)
    }
  }
  return event
})
