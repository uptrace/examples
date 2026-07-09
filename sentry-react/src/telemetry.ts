// telemetry.ts — every Sentry SDK call the app makes lives here, isolated from
// the UI. Nothing here starts a new trace: spans, logs and errors all attach to
// the trace the router-tracing integration opened for the current pageload or
// navigation. Each call also records a breadcrumb and (feature calls, added in
// later tasks) push a record to the signals store for the in-page Inspector.
import * as Sentry from '@sentry/react'

// Base URL of the Uptrace UI (e.g. http://localhost:5000), used to build a link
// to the current trace. Optional: without it the badge still shows the trace id.
const UPTRACE_URL = import.meta.env.VITE_UPTRACE_URL

// Project id, taken from the last path segment of the DSN, needed for trace links.
const PROJECT_ID = projectIdFromDsn(import.meta.env.VITE_SENTRY_DSN)

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event later sent on this trace.
export function breadcrumb(message: string): void {
  Sentry.addBreadcrumb({ category: 'signal', message, level: 'info' })
}

// TraceLink is the current trace id plus an optional deep link to it in Uptrace.
export interface TraceLink {
  traceId: string
  url: string | null
}

// currentTraceId returns the trace id the next signal will attach to. It prefers
// the active root span (the idle pageload/navigation transaction); once that has
// ended it falls back to the propagation context carried in the sentry-trace
// header, which still names the current page's trace.
export function currentTraceId(): string | null {
  const active = Sentry.getActiveSpan()
  if (active) {
    return Sentry.getRootSpan(active).spanContext().traceId
  }
  const header = Sentry.getTraceData()['sentry-trace']
  return header ? header.split('-')[0] : null
}

// currentTraceLink is the current trace id plus a link to it in Uptrace.
export function currentTraceLink(): TraceLink | null {
  const traceId = currentTraceId()
  if (!traceId) {
    return null
  }
  return { traceId, url: traceUrl(traceId) }
}

// traceUrl builds a project-scoped link into a trace in the Uptrace UI, or null
// when the UI URL or project id is unavailable.
function traceUrl(traceId: string): string | null {
  if (!UPTRACE_URL || !PROJECT_ID) {
    return null
  }
  const base = UPTRACE_URL.replace(/\/+$/, '')
  return `${base}/explore/${PROJECT_ID}/traces/${traceId}`
}

// projectIdFromDsn returns the project id, the last path segment of the DSN
// (e.g. "2" in http://token@host/2), or null if the DSN is absent or malformed.
function projectIdFromDsn(dsn: string | undefined): string | null {
  if (!dsn) {
    return null
  }
  try {
    const segments = new URL(dsn).pathname.split('/').filter(Boolean)
    return segments.at(-1) ?? null
  } catch {
    return null
  }
}
