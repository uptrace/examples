// signals.ts — a tiny framework-free store holding the most recent telemetry
// signal the app produced, so the in-page Inspector can show "what was just
// sent" without the devtools Network tab. Every telemetry.ts feature call pushes
// here. It also mirrors each record onto window.__signals so end-to-end tests
// can read what the app sent.

// SignalKind is which signal type a record describes.
export type SignalKind = 'span' | 'http' | 'error'

// SignalRecord is one produced signal, shaped for display and for tests.
export interface SignalRecord {
  kind: SignalKind
  // label is the human summary: the span/error name or the request line.
  label: string
  // traceId is the trace the signal attached to when it was produced.
  traceId: string | null
  // durationMs is set for spans and http requests (their measured time).
  durationMs?: number
  // spanId is set for custom spans, so the Inspector can deep-link to that span.
  spanId?: string
  // errorType is the error kind for errors (e.g. 'RangeError').
  errorType?: string
  // detail is optional extra context (e.g. an HTTP status).
  detail?: string
}

let snapshot: SignalRecord | null = null
const listeners = new Set<() => void>()

// push records the newest signal, mirrors it to window.__signals (created on
// first use, for tests), and notifies subscribers.
export function push(record: SignalRecord): void {
  snapshot = record
  window.__signals = window.__signals ?? []
  window.__signals.push(record)
  for (const listener of listeners) {
    listener()
  }
}

// subscribeSignals registers a listener and returns an unsubscribe function.
export function subscribeSignals(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// getSignalSnapshot returns the latest record (stable reference between pushes).
export function getSignalSnapshot(): SignalRecord | null {
  return snapshot
}
