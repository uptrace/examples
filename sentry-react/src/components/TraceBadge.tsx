// TraceBadge shows the trace id of the current page (pageload or navigation) and —
// once telemetry is confirmed reaching Uptrace — a link to that trace. Both values
// come from stores, so the badge re-renders when the page root changes or delivery
// settles, with no effects of its own.
//
// The link waits for a settled ok so it never points at a trace that failed to
// arrive, and never flashes in and out while an envelope is in flight.
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { getPageTraceId, subscribePageTrace, uptraceUrl } from '../telemetry'
import { useSettledDelivery } from '../delivery'

export function TraceBadge() {
  const traceId = useSyncExternalStore(subscribePageTrace, getPageTraceId)
  const settled = useSettledDelivery()
  const url = uptraceUrl(traceId)

  // The connection status lives in the bottom bar (DeliveryStatus); here we only
  // surface the Uptrace link once delivery has settled on ok.
  let linkNode: ReactNode = null
  if (traceId && !url) {
    linkNode = <span className="trace-badge__label">set VITE_UPTRACE_URL for a link</span>
  } else if (url && settled?.state === 'ok') {
    linkNode = (
      <a className="trace-badge__cta" href={url} target="_blank" rel="noreferrer">
        View in Uptrace ↗
      </a>
    )
  }

  return (
    <div className="trace-badge">
      <span className="trace-badge__label">current trace</span>
      <code className="trace-badge__id">{traceId ?? '—'}</code>
      {linkNode}
    </div>
  )
}
