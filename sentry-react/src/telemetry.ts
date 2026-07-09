// telemetry.ts — every Sentry SDK call the app makes lives here, isolated from
// the UI. Nothing in this file starts a new trace: spans, logs and errors all
// attach to the trace the browser-tracing integration opened for the current
// page load or navigation. That is the whole point of the example — signals
// share the current route's trace instead of each minting its own.
import * as Sentry from '@sentry/react'

// Base URL of the Uptrace UI (e.g. http://localhost:5000), used to build a link
// to the current trace. Optional: without it the badge still shows the trace id.
const UPTRACE_URL = import.meta.env.VITE_UPTRACE_URL

// Project id, taken from the last path segment of the DSN. The trace link is
// project-scoped (/explore/<projectId>/traces/<traceId>), so we need it.
const PROJECT_ID = projectIdFromDsn(import.meta.env.VITE_SENTRY_DSN)

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event later sent on this trace.
export function breadcrumb(message: string): void {
  Sentry.addBreadcrumb({ category: 'todo', message, level: 'info' })
}

// openTodoSpan starts an inactive span standing for an open todo. The caller
// holds the span and ends it when the todo is completed or deleted, so the
// span's duration measures how long the todo stayed open. It is an inactive
// span (startInactiveSpan, not startSpan) precisely because its lifetime is a
// user's, not a function call's. No startNewTrace: it joins the current trace.
export function openTodoSpan(id: string, text: string): Sentry.Span {
  return Sentry.startInactiveSpan({
    name: 'todo.open',
    op: 'todo',
    attributes: { todo_id: id, todo_text: text },
  })
}

// endTodoSpan closes a todo's span. When the todo was removed before being
// completed we tag it cancelled so the two outcomes are distinguishable.
export function endTodoSpan(span: Sentry.Span, opts?: { cancelled?: boolean }): void {
  if (opts?.cancelled) {
    span.setAttribute('cancelled', true)
  }
  span.end()
}

// logAdded / logDeleted emit real structured logs via the Sentry Logs API
// (enabled with enableLogs in instrument.ts). This is NOT captureMessage, which
// produces message events; logger.* is how Sentry models logs. The todo id and
// text ride along as queryable attributes.
export function logAdded(id: string, text: string): void {
  Sentry.logger.info('Added todo', { todo_id: id, todo_text: text })
}

export function logDeleted(id: string, text: string): void {
  Sentry.logger.info('Deleted todo', { todo_id: id, todo_text: text })
}

// ERRORS are the demo failures. Varied types and messages so Uptrace groups
// them as distinct issues instead of one repeated error. Each is built fresh on
// use so its stack trace points at the app.
const ERRORS: ReadonlyArray<() => Error> = [
  () => new Error('Example error from the React Todo app'),
  () => new TypeError("Cannot read properties of undefined (reading 'text')"),
  () => new RangeError('Todo limit of 100 exceeded'),
  () =>
    Object.assign(new Error('Failed to sync todos: network request timed out'), {
      name: 'TodoSyncError',
    }),
]

// captureTestError reports a random error on the CURRENT trace. captureException
// does not start a trace, so firing this twice on one page yields two errors
// that share the page's trace id.
export function captureTestError(): void {
  breadcrumb('Reporting a test error')
  Sentry.captureException(pickRandom(ERRORS)())
}

// TraceLink is the current trace id plus an optional deep link to it in Uptrace.
export interface TraceLink {
  traceId: string
  url: string | null
}

// currentTraceLink reads the trace id of the active root span — the pageload
// trace the browser-tracing integration opened — and builds a link to it. Read
// it shortly after load, while that idle span is still active.
export function currentTraceLink(): TraceLink | null {
  const active = Sentry.getActiveSpan()
  const root = active ? Sentry.getRootSpan(active) : undefined
  if (!root) {
    return null
  }
  const { traceId } = root.spanContext()
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

// pickRandom returns a random element of a non-empty array.
function pickRandom<T>(items: ReadonlyArray<T>): T {
  return items[Math.floor(Math.random() * items.length)]
}
