import { useSyncExternalStore } from 'react'
import { subscribeSignals, getSignalSnapshot } from '../signals'
import type { SignalRecord } from '../signals'
import { uptraceUrl } from '../telemetry'
import { useSettledDelivery } from '../delivery'
import { DeliveryStatus } from './DeliveryStatus'

// uptraceKind maps the app's control type to the signal type Uptrace actually
// stores, so the pill matches what you find there: a todo or an HTTP request is a
// span (an HTTP request is just an http.client span); an error is an error.
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

// Inspector is the fixed bottom bar: what the last control sent (and a link to its
// trace in Uptrace) on the left, and the Uptrace delivery status on the right, so
// "what was sent" and "did it arrive" sit together next to the trace id.
export function Inspector() {
  const record = useSyncExternalStore(subscribeSignals, getSignalSnapshot)
  const settled = useSettledDelivery()
  // Only link a signal once delivery has settled on ok: an envelope that never
  // reached Uptrace has nothing to open there, so we describe it without a link
  // (the delivery status alongside says why). Same rule as TraceBadge.
  const delivered = settled?.state === 'ok'
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
