// telemetry.ts — every Sentry SDK call the app makes lives here, isolated from
// the UI. Nothing here starts a new trace: every signal attaches to the current
// pageload/navigation trace and is NESTED under that page's root span, so Uptrace
// (which shows one root per trace) draws the whole page as a single tree. Each
// call also records a breadcrumb and pushes a record to the signals store for the
// in-page Inspector.
import * as Sentry from '@sentry/react'
import { push } from './signals'

// pageRoot holds the current page's root span — the pageload/navigation transaction
// the browser-tracing integration opened. Interactions nest under it so the whole
// page is one tree with a single root in Uptrace (which shows only one root per
// trace). Refreshed on every later navigation via the spanStart hook; the very
// first pageload span is seeded separately (see installPageRootTracking) because
// it starts synchronously during Sentry.init, before any hook can observe it.
let pageRoot: Sentry.Span | undefined

// pageRootTrackingInstalled guards installPageRootTracking against running twice
// (e.g. duplicate imports/HMR), which would otherwise attach a second spanStart
// listener.
let pageRootTrackingInstalled = false

// installPageRootTracking wires up tracking of the current page's root span. Call
// it once right after Sentry.init (from instrument.ts). Two mechanisms are needed:
//  - The spanStart hook catches every LATER pageload/navigation span (e.g. on
//    route changes), since those start after this function has already run.
//  - The initial pageload span is a special case: the reactRouterV7 browser-
//    tracing integration starts it synchronously inside Sentry.init's
//    afterAllSetup, so its spanStart fires before this listener exists and the
//    hook alone would never see it. It is seeded directly from the still-active
//    span right after subscribing.
export function installPageRootTracking(): void {
  if (pageRootTrackingInstalled) return
  pageRootTrackingInstalled = true

  Sentry.getClient()?.on('spanStart', (span) => {
    const { parent_span_id: parentSpanId, op } = Sentry.spanToJSON(span)
    if (!parentSpanId && (op === 'pageload' || op === 'navigation')) {
      pageRoot = span
    }
  })

  // The initial pageload span already started (and emitted spanStart) synchronously
  // inside Sentry.init, before this listener existed, so the hook above never saw
  // it. Seed pageRoot from the still-active pageload idle span.
  const active = Sentry.getActiveSpan()
  if (active) {
    const root = Sentry.getRootSpan(active)
    const op = Sentry.spanToJSON(root).op
    if (op === 'pageload' || op === 'navigation') {
      pageRoot = root
    }
  }
}

// nested runs a span as a child transaction of the current page root, so the
// interaction attaches under the page's tree instead of becoming a sibling root.
// forceTransaction makes it its own sent envelope; parentSpan stamps the page
// root's trace id and span id onto it (works even after the pageload transaction
// ended — only its spanContext is read). When pageRoot is undefined (before the
// first pageload span), it falls back to the active span/scope: today's behavior.
function nested<T>(options: Parameters<typeof Sentry.startSpan>[0], cb: (span: Sentry.Span) => T): T {
  return Sentry.startSpan({ ...options, parentSpan: pageRoot, forceTransaction: true }, cb)
}

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
  return { traceId, url: uptraceUrl(traceId) }
}

// uptraceUrl builds a project-scoped link into the Uptrace UI for a trace, and
// deep-links to a specific span when spanId is given by adding it as a path
// segment (/traces/<traceId>/<spanId>) — the form the Uptrace explore UI uses;
// the ?span_id= query param is ignored there. Returns null when the UI URL, the
// project id, or the trace id is unavailable.
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

// captureAppError captures err inside its own span "error: <type>" (a child of the
// page root, so it attaches to the current route's trace) and records the signal.
// No op is set, so Uptrace names the span "error: <type>" rather than prefixing it
// (e.g. "ui.error: ..."); its Logs & Errors entry links to that span, not the root.
function captureAppError(type: string, err: Error): void {
  const { traceId, spanId } = nested({ name: `error: ${type}` }, (span) => {
    Sentry.captureException(err)
    return span.spanContext()
  })
  push({ kind: 'error', label: err.message, errorType: type, spanId, traceId })
}

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

// createTodo records a new todo and sends an instant "created todo: <text>" span,
// so adding a todo shows up immediately. No op is set, so Uptrace names it by that
// label. The span nests under the page root.
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

// completeTodo sends a "completed todo: <text>" span back-dated to the todo's
// creation (startTime), so its duration is how long the todo was open. It nests
// under the page root.
export function completeTodo(todo: Todo): void {
  breadcrumb(`Completed todo "${todo.text}"`)
  const span = Sentry.startInactiveSpan({
    name: `completed todo: ${todo.text}`,
    startTime: new Date(todo.createdAt),
    parentSpan: pageRoot,
    forceTransaction: true,
  })
  // Both ids come from the span we just sent, never from the surrounding scope: the
  // deep link pairs them, so a scope-derived trace id could name a trace this span
  // does not live in.
  const { spanId, traceId } = span.spanContext()
  span.end()
  const durationMs = Date.now() - todo.createdAt
  push({ kind: 'span', label: `completed todo: ${todo.text}`, durationMs, spanId, traceId })
}

// RequestKind is the three demo endpoints the HTTP panel can call.
export type RequestKind = 'ok' | 'slow' | 'fail'

// sendRequest fetches a dev endpoint, producing an http.client span on the
// current trace (the browser-tracing integration instruments fetch). It records
// its own measured record for the Inspector, and treats a non-OK response as a
// failure worth capturing as an error too.
export async function sendRequest(kind: RequestKind): Promise<void> {
  breadcrumb(`Sending ${kind} request`)
  const startedAt = performance.now()
  await nested({ name: `GET /api/${kind}`, op: 'http' }, async (span) => {
    const { spanId, traceId } = span.spanContext()
    try {
      const res = await fetch(`/api/${kind}`)
      // Record the status on the request span (semconv key), so it's queryable in
      // Uptrace as http.response.status_code and visible on the span we link to.
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
