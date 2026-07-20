// telemetry.ts — every Sentry SDK call the app makes. Nothing here starts a trace
// and nothing re-parents a span: each signal is sent exactly as the Sentry SDK
// would send it, and inherits the current pageload/navigation trace from the scope.
// Interactions are therefore sibling root spans of one trace, not a single tree.
// Each call also leaves a breadcrumb and pushes to the signals store.
import * as Sentry from '@sentry/react'
import { push } from './signals'

// Base URL of the Uptrace UI. Optional: without it the badge still shows the id.
const UPTRACE_URL = import.meta.env.VITE_UPTRACE_URL

// Project id, taken from the last path segment of the DSN, needed for trace links.
const PROJECT_ID = projectIdFromDsn(import.meta.env.VITE_SENTRY_DSN)

// getPageTraceId returns the trace every signal on this page attaches to: the one the
// SDK holds on the current scope, which is exactly where a span with no parent takes
// its trace id from. Null before the first pageload span exists.
export function getPageTraceId(): string | null {
  return Sentry.getCurrentScope().getPropagationContext().traceId ?? null
}

// uptraceUrl links into the Uptrace UI: a trace, or a span within it when spanId is
// given (/traces/<traceId>/<spanId> — the explore UI ignores ?span_id=). Null when
// the UI URL, project id or trace id is missing.
export function uptraceUrl(traceId: string | null, spanId?: string): string | null {
  if (!UPTRACE_URL || !PROJECT_ID || !traceId) {
    return null
  }
  const base = UPTRACE_URL.replace(/\/+$/, '')
  const url = `${base}/explore/${PROJECT_ID}/traces/${traceId}`
  return spanId ? `${url}/${spanId}` : url
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

// ErrorType is the demo error kinds — varied so Uptrace groups them as distinct
// issues instead of one repeated error.
export type ErrorType = 'Error' | 'TypeError' | 'RangeError' | 'SyncError'

// reportError captures one exception of a fixed demo kind (the home Errors panel).
export function reportError(type: ErrorType): void {
  breadcrumb(`Reporting a ${type}`)
  captureAppError(type, buildError(type))
}

// reportNamedError reports an error with a custom exception name and message (the
// per-route error buttons). Distinct names become distinct issues in Uptrace.
export function reportNamedError(name: string, message: string): void {
  breadcrumb(`Reporting ${name}: ${message}`)
  captureAppError(name, Object.assign(new Error(message), { name }))
}

// captureAppError captures err as a plain Sentry error event. It carries no span of
// its own: the SDK attaches it to the current trace, which is all Sentry does.
function captureAppError(type: string, err: Error): void {
  Sentry.captureException(err)
  push({ kind: 'error', label: err.message, errorType: type, traceId: getPageTraceId() })
}

// buildError constructs a fresh error of the requested kind so its stack points
// at the app.
function buildError(type: ErrorType): Error {
  switch (type) {
    case 'TypeError':
      return new TypeError("Cannot read properties of undefined (reading 'value')")
    case 'RangeError':
      return new RangeError('Value out of range')
    case 'SyncError':
      return Object.assign(new Error('Failed to sync: network request timed out'), {
        name: 'SyncError',
      })
    case 'Error':
    default:
      return new Error('Example error')
  }
}

// Todo is one item in the Todos panel. createdAt (ms epoch) records when it was
// added, so completeTodo can back-date the completed span and measure the time the
// todo was open.
export interface Todo {
  id: number
  text: string
  createdAt: number
  // traceId/spanId of the "created todo" span, so each row can deep-link to it.
  traceId: string
  spanId: string
}

// nextTodoId hands out a stable id per todo for the list's React keys.
let nextTodoId = 1

// createTodo sends an instant "created todo: <text>" span. With no span active it is
// a root span of the current trace, which is how the SDK sends it unaided.
export function createTodo(text: string): Todo {
  const createdAt = Date.now()
  breadcrumb(`Created todo "${text}"`)
  const span = Sentry.startInactiveSpan({
    name: `created todo: ${text}`,
  })
  const { spanId, traceId } = span.spanContext()
  span.end()
  push({ kind: 'span', label: `created todo: ${text}`, durationMs: 0, spanId, traceId })
  return { id: nextTodoId++, text, createdAt, traceId, spanId }
}

// completeTodo sends a "completed todo: <text>" span back-dated to the todo's creation,
// so its duration is how long the todo was open.
export function completeTodo(todo: Todo): void {
  breadcrumb(`Completed todo "${todo.text}"`)
  const span = Sentry.startInactiveSpan({
    name: `completed todo: ${todo.text}`,
    startTime: new Date(todo.createdAt),
  })
  // Both ids come from the span we just sent: the deep link pairs them, so a
  // scope-derived trace id could name a trace this span does not live in.
  const { spanId, traceId } = span.spanContext()
  span.end()
  const durationMs = Date.now() - todo.createdAt
  push({ kind: 'span', label: `completed todo: ${todo.text}`, durationMs, spanId, traceId })
}

// RequestKind is the three demo endpoints the HTTP panel can call.
export type RequestKind = 'ok' | 'slow' | 'fail'

// sendRequest fetches a dev endpoint inside a request span of its own, which the SDK's
// auto-instrumented http.client span then nests under — an ordinary parent/child pair,
// since the fetch really does happen inside this span. A non-OK response is captured
// as an error too.
export async function sendRequest(kind: RequestKind): Promise<void> {
  breadcrumb(`Sending ${kind} request`)
  const startedAt = performance.now()
  await Sentry.startSpan({ name: `GET /api/${kind}`, op: 'http' }, async (span) => {
    const { spanId, traceId } = span.spanContext()
    try {
      const res = await fetch(`/api/${kind}`)
      // Semconv key, so the status is queryable in Uptrace.
      span.setAttribute('http.response.status_code', res.status)
      const durationMs = Math.round(performance.now() - startedAt)
      push({
        kind: 'http',
        label: `GET /api/${kind}`,
        durationMs,
        detail: `HTTP ${res.status}`,
        spanId,
        traceId,
      })
      if (!res.ok) {
        const err = new Error(`Request to /api/${kind} failed: HTTP ${res.status}`)
        Sentry.captureException(err)
        push({ kind: 'error', label: err.message, errorType: 'Error', spanId, traceId })
      }
    } catch (e) {
      const durationMs = Math.round(performance.now() - startedAt)
      Sentry.captureException(e)
      push({
        kind: 'http',
        label: `GET /api/${kind}`,
        durationMs,
        detail: 'network error',
        spanId,
        traceId,
      })
      // The exception is on its way to Uptrace, so record it as an error signal too
      // — as the non-OK path above does — or the Inspector would only show the span.
      const err = e instanceof Error ? e : new Error(String(e))
      push({ kind: 'error', label: err.message, errorType: err.name, spanId, traceId })
    }
  })
}

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event later sent on this trace.
function breadcrumb(message: string): void {
  Sentry.addBreadcrumb({ category: 'signal', message, level: 'info' })
}
