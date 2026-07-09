// Sentry initialization for the browser.
//
// This file is imported FIRST in main.tsx (before React) so Sentry installs its
// instrumentation before the app renders.
//
// The DSN is read from `VITE_SENTRY_DSN`. Copy `.env.example` to `.env` and
// paste the Sentry DSN from your Uptrace project. See README.md for details.
import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'

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

  // reactRouterV6BrowserTracingIntegration opens a pageload trace on first load
  // and a navigation trace on every route change, each named by the matched
  // route (e.g. /todo/:id). This is the only place traces are started — the app
  // never calls startNewTrace; spans/logs/errors attach to the current trace.
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],

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
