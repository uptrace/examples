// TraceBadge names the current page's trace, and links to it only once delivery has
// settled ok — so the link never points at a trace that never arrived.
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { getPageTraceId, subscribePageTrace, uptraceUrl } from '../telemetry'
import { useSettledDelivery } from '../delivery'

export function TraceBadge() {
  const traceId = useSyncExternalStore(subscribePageTrace, getPageTraceId)
  const settled = useSettledDelivery()
  const url = uptraceUrl(traceId)

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
