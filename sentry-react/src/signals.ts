// signals.ts — a framework-free store holding the last signal the app sent, so the
// Inspector can show it without the devtools Network tab. telemetry.ts pushes here.

// SignalKind is which signal type a record describes.
export type SignalKind = 'span' | 'http' | 'error'

// SignalRecord is one produced signal, shaped for display.
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

// push records the newest signal and notifies subscribers.
export function push(record: SignalRecord): void {
  snapshot = record
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
