// telemetry.ts — every Sentry SDK call the app makes. Nothing here starts a trace:
// each signal attaches to the current pageload/navigation trace, nested under that
// page's root span, so Uptrace (which keeps one root per trace) draws the page as a
// single tree. Each call also leaves a breadcrumb and pushes to the signals store.
import * as Sentry from '@sentry/react'
import { push } from './signals'

// Base URL of the Uptrace UI. Optional: without it the badge still shows the id.
const UPTRACE_URL = import.meta.env.VITE_UPTRACE_URL

// Project id, taken from the last path segment of the DSN, needed for trace links.
const PROJECT_ID = projectIdFromDsn(import.meta.env.VITE_SENTRY_DSN)

// pageRoot is the current page's root span (the pageload/navigation transaction).
// Interactions nest under it; it is refreshed on every navigation.
let pageRoot: Sentry.Span | undefined

// Listeners notified whenever pageRoot changes, i.e. once per pageload/navigation.
const pageTraceListeners = new Set<() => void>()

// Guards against a second spanStart listener (duplicate imports / HMR).
let pageRootTrackingInstalled = false

// installPageRootTracking tracks each page's root span. Call it once, right after
// Sentry.init. The spanStart hook catches every later navigation span; the initial
// pageload span needs the separate seed below.
export function installPageRootTracking(): void {
  if (pageRootTrackingInstalled) return
  pageRootTrackingInstalled = true

  Sentry.getClient()?.on('spanStart', (span) => {
    const { parent_span_id: parentSpanId, op } = Sentry.spanToJSON(span)
    if (!parentSpanId && (op === 'pageload' || op === 'navigation')) {
      setPageRoot(span)
    }
  })

  // The pageload span started synchronously inside Sentry.init — before the hook
  // above existed, so it never saw it. Seed from the still-active span.
  const active = Sentry.getActiveSpan()
  if (active) {
    const root = Sentry.getRootSpan(active)
    const op = Sentry.spanToJSON(root).op
    if (op === 'pageload' || op === 'navigation') {
      setPageRoot(root)
    }
  }
}

// setPageRoot records the new page root and notifies the UI subscribed to it.
function setPageRoot(span: Sentry.Span): void {
  pageRoot = span
  for (const listener of pageTraceListeners) {
    listener()
  }
}

// getPageTraceId returns the trace every signal on this page attaches to. Null only
// before the first pageload span exists.
export function getPageTraceId(): string | null {
  return pageRoot?.spanContext().traceId ?? null
}

// subscribePageTrace registers a listener for page-root changes (one per navigation).
export function subscribePageTrace(listener: () => void): () => void {
  pageTraceListeners.add(listener)
  return () => pageTraceListeners.delete(listener)
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

// captureAppError captures err inside its own span, a child of the page root. No op
// is set, so Uptrace names the span "error: <type>" instead of prefixing it.
function captureAppError(type: string, err: Error): void {
  const { traceId, spanId } = nested({ name: `error: ${type}` }, (span) => {
    Sentry.captureException(err)
    return span.spanContext()
  })
  push({ kind: 'error', label: err.message, errorType: type, spanId, traceId })
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

// createTodo sends an instant "created todo: <text>" span, nested under the page root.
export function createTodo(text: string): Todo {
  const createdAt = Date.now()
  breadcrumb(`Created todo "${text}"`)
  const span = Sentry.startInactiveSpan({
    name: `created todo: ${text}`,
    parentSpan: pageRoot,
    forceTransaction: true,
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
    parentSpan: pageRoot,
    forceTransaction: true,
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
// auto-instrumented http.client span then nests under: alone, that span would be a
// sibling root once the pageload span has ended. A non-OK response is captured as an
// error too.
export async function sendRequest(kind: RequestKind): Promise<void> {
  breadcrumb(`Sending ${kind} request`)
  const startedAt = performance.now()
  await nested({ name: `GET /api/${kind}`, op: 'http' }, async (span) => {
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

// nested runs a span as a child transaction of the page root, so the interaction
// joins the page's tree instead of becoming a sibling root (which Uptrace drops).
// parentSpan works even after the pageload transaction ended: only its spanContext
// is read. Falls back to the active span/scope before the first pageload span.
function nested<T>(options: Parameters<typeof Sentry.startSpan>[0], cb: (span: Sentry.Span) => T): T {
  return Sentry.startSpan({ ...options, parentSpan: pageRoot, forceTransaction: true }, cb)
}

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event later sent on this trace.
export function breadcrumb(message: string): void {
  Sentry.addBreadcrumb({ category: 'signal', message, level: 'info' })
}
