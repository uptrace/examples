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
// trace). Refreshed on every navigation via the spanStart hook.
let pageRoot: Sentry.Span | undefined

// installPageRootTracking subscribes to the client's spanStart hook to remember the
// current page root. Call it once right after Sentry.init (from instrument.ts): the
// pageload span starts during init, before this module is first imported, so
// subscribing lazily here would miss it.
export function installPageRootTracking(): void {
  Sentry.getClient()?.on('spanStart', (span) => {
    const { parent_span_id: parentSpanId, op } = Sentry.spanToJSON(span)
    if (!parentSpanId && (op === 'pageload' || op === 'navigation')) {
      pageRoot = span
    }
  })
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
      return new Error('Example error from the Signal Console')
  }
}

// reportError captures one exception of the given kind, nested as a child
// transaction of the page's root span (see `nested`), so it attaches to the
// page's trace instead of becoming a separate root.
export function reportError(type: ErrorType): void {
  breadcrumb(`Reporting a ${type}`)
  const err = buildError(type)
  nested({ name: `error: ${type}`, op: 'ui.error' }, () => {
    Sentry.captureException(err)
  })
  push({ kind: 'error', label: err.message, errorType: type, traceId: currentTraceId() })
}

// NamedSpan is a running custom span plus what we need to report its duration.
export interface NamedSpan {
  span: Sentry.Span
  name: string
  startedAt: number
}

// startNamedSpan starts an inactive span named exactly what the user typed. It
// is inactive (startInactiveSpan) because its lifetime is a user's, not a
// function call's — the caller ends it with endNamedSpan. No startNewTrace: it
// joins the current trace.
export function startNamedSpan(name: string): NamedSpan {
  breadcrumb(`Started span "${name}"`)
  const span = Sentry.startInactiveSpan({
    name,
    op: 'ui.custom',
    parentSpan: pageRoot,
    forceTransaction: true,
  })
  return { span, name, startedAt: performance.now() }
}

// endNamedSpan closes a custom span and records its measured duration.
export function endNamedSpan(handle: NamedSpan): void {
  handle.span.end()
  const durationMs = Math.round(performance.now() - handle.startedAt)
  const { spanId } = handle.span.spanContext()
  breadcrumb(`Stopped span "${handle.name}" (${durationMs}ms)`)
  push({ kind: 'span', label: handle.name, durationMs, traceId: currentTraceId(), spanId })
}

// LogLevel is the structured-log severities the Logs panel emits.
export type LogLevel = 'info' | 'warn' | 'error'

// emitLog sends a real structured log via the Sentry Logs API (enabled with
// enableLogs in instrument.ts). This is NOT captureMessage — logger.* is how
// Sentry models logs. Attributes ride along as queryable fields.
export function emitLog(level: LogLevel, message: string): void {
  breadcrumb(`Log ${level}: ${message}`)
  const attributes = { source: 'signal-console' }
  const write = () => {
    if (level === 'info') {
      Sentry.logger.info(message, attributes)
    } else if (level === 'warn') {
      Sentry.logger.warn(message, attributes)
    } else {
      Sentry.logger.error(message, attributes)
    }
  }
  if (pageRoot) {
    Sentry.withActiveSpan(pageRoot, write)
  } else {
    write()
  }
  push({ kind: 'log', label: message, level, traceId: currentTraceId() })
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
  await nested({ name: `GET /api/${kind}`, op: 'http' }, async () => {
    try {
      const res = await fetch(`/api/${kind}`)
      const durationMs = Math.round(performance.now() - startedAt)
      push({
        kind: 'http',
        label: `GET /api/${kind}`,
        durationMs,
        detail: `HTTP ${res.status}`,
        traceId: currentTraceId(),
      })
      if (!res.ok) {
        const err = new Error(`Request to /api/${kind} failed: HTTP ${res.status}`)
        Sentry.captureException(err)
        push({ kind: 'error', label: err.message, errorType: 'Error', traceId: currentTraceId() })
      }
    } catch (e) {
      const durationMs = Math.round(performance.now() - startedAt)
      Sentry.captureException(e)
      push({
        kind: 'http',
        label: `GET /api/${kind}`,
        durationMs,
        detail: 'network error',
        traceId: currentTraceId(),
      })
    }
  })
}
