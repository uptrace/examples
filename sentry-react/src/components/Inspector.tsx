import { useSyncExternalStore } from 'react'
import { subscribeSignals, getSignalSnapshot } from '../signals'
import type { SignalRecord } from '../signals'
import { uptraceUrl } from '../telemetry'

// describe turns a record into the one-line summary the Inspector shows.
function describe(r: SignalRecord): string {
  switch (r.kind) {
    case 'span':
      return `span "${r.label}" — ${r.durationMs}ms`
    case 'http':
      return `${r.label} — ${r.detail} in ${r.durationMs}ms`
    case 'log':
      return `${r.level} log — "${r.label}"`
    case 'error':
      return `${r.errorType} — "${r.label}"`
  }
}

// Inspector shows what the last control sent and which trace it attached to, so
// you never need the devtools Network tab to see a signal reach Uptrace.
export function Inspector() {
  const record = useSyncExternalStore(subscribeSignals, getSignalSnapshot)
  // Link into Uptrace: to the exact span when we captured a span id (custom
  // spans), otherwise to the signal's trace. Null when VITE_UPTRACE_URL is unset.
  const url = record ? uptraceUrl(record.traceId, record.spanId) : null
  return (
    <aside className="inspector" data-kind={record?.kind ?? 'none'}>
      <span className="inspector__label">last signal</span>
      {record ? (
        <div className="inspector__body">
          <code className="inspector__kind">{record.kind}</code>
          {url ? (
            <a className="inspector__link" href={url} target="_blank" rel="noreferrer">
              {describe(record)} ↗
            </a>
          ) : (
            <span className="inspector__text">{describe(record)}</span>
          )}
          <span className="inspector__trace">trace {record.traceId ?? '—'}</span>
        </div>
      ) : (
        <span className="inspector__empty">No signal yet. Use a control above.</span>
      )}
    </aside>
  )
}
