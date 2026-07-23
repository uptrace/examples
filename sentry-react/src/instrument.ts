// Sentry initialization — the only Uptrace-specific code in the app. Imported FIRST
// in main.tsx so instrumentation is in place before React renders. Point the DSN at
// your Uptrace project: copy .env.example to .env (see README.md).
import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom'
import { makeReportingTransport } from './delivery'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (!dsn) {
  // Without a DSN the SDK is inert, so say so instead of dropping every event.
  console.warn(
    'VITE_SENTRY_DSN is not set. Copy .env.example to .env and paste your ' +
      'Uptrace Sentry DSN, then restart `npm run dev`.',
  )
}

Sentry.init({
  dsn,

  // Observes each send so the UI can show whether envelopes arrive; it wraps the
  // standard fetch transport and does not change delivery (src/delivery.ts).
  transport: makeReportingTransport,

  // Opens a pageload trace on load and a navigation trace per route change, named by
  // route pattern (/products/:id). The app never starts a trace itself.
  integrations: [
    Sentry.reactRouterBrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],

  // Sample everything: this is a demo. Lower it in production.
  tracesSampleRate: 1.0,

  // Attaches user/IP to events. Turn off to avoid PII.
  sendDefaultPii: true,

  // An attribute on every event, so you can filter this example's data.
  environment: 'development',

  // Uptrace derives the service from the release, splitting on the last "@":
  // "<service.name>@<service.version>". Without it every span lands under
  // "unknown_service".
  release: 'sentry-react@1.0.0',
})
