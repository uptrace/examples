// The fixed bottom bar: what the last control sent, and whether it reached Uptrace.
import { useSyncExternalStore } from 'react'
import { subscribeSignals, getSignalSnapshot } from './signals'
import type { SignalRecord } from './signals'
import { uptraceUrl } from './telemetry'
import { useSettledDelivery } from './delivery'
import type { DeliveryStatus as Status } from './delivery'

// Inspector shows what the last control sent on the left and the delivery status on
// the right, so "what was sent" and "did it arrive" sit together. It links the signal
// only once delivery has settled ok: an envelope that never arrived has nothing to
// open in Uptrace.
export function Inspector() {
  const record = useSyncExternalStore(subscribeSignals, getSignalSnapshot)
  const delivered = useSettledDelivery()?.state === 'ok'
  const url = record && delivered ? uptraceUrl(record.traceId, record.spanId) : null
  return (
    <aside className="inspector" data-kind={record?.kind ?? 'none'}>
      <span className="inspector__label">last signal</span>
      <div className="inspector__signal">
        {record ? (
          <>
            <code className="inspector__kind">{uptraceKind[record.kind]}</code>
            {url ? (
              <a className="inspector__link" href={url} target="_blank" rel="noreferrer">
                {describe(record)} ↗
              </a>
            ) : (
              <span className="inspector__text">{describe(record)}</span>
            )}
          </>
        ) : (
          <span className="inspector__empty">No signal yet. Use a control above.</span>
        )}
      </div>
      <DeliveryStatus />
    </aside>
  )
}

// uptraceKind maps the app's control type to the signal type Uptrace actually stores,
// so the pill matches what you find there: an HTTP request is just a span.
const uptraceKind: Record<SignalRecord['kind'], string> = {
  span: 'span',
  http: 'span',
  error: 'error',
}

// describe turns a record into the one-line summary the Inspector shows.
function describe(r: SignalRecord): string {
  switch (r.kind) {
    case 'span':
      return `span "${r.label}", ${r.durationMs}ms`
    case 'http':
      return `${r.label}, ${r.detail} in ${r.durationMs}ms`
    case 'error':
      return `${r.errorType}: "${r.label}"`
  }
}

// DeliveryStatus makes a broken DSN/host visible: it stays quiet until an envelope
// fails to reach Uptrace (delivery.ts observes every send).
function DeliveryStatus() {
  const settled = useSettledDelivery()
  if (settled?.state !== 'failed') {
    return null
  }
  return (
    <div className="delivery" data-state={settled.state}>
      <span className="delivery__dot" aria-hidden="true" />
      <span className="delivery__text">{deliveryMessage(settled)}</span>
    </div>
  )
}

// deliveryMessage is the line shown when a send fails.
function deliveryMessage(status: Status): string {
  switch (status.state) {
    case 'idle':
      return 'Waiting for the first event…'
    case 'sending':
      return 'Connecting to Uptrace…'
    case 'ok':
      return 'Connected to Uptrace ✓'
    case 'failed':
      // A statusCode means the host answered but rejected the data; none means we
      // never reached it, so name the host — a wrong DSN host is the usual cause.
      return status.statusCode
        ? `Uptrace rejected the data (HTTP ${status.statusCode})`
        : `Can't reach Uptrace at ${status.host ?? 'the ingest server'}`
  }
}
