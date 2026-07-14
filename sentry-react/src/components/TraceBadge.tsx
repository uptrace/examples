// TraceBadge shows the trace id of the current page load and — once telemetry is
// confirmed reaching Uptrace — a link to that trace. It reads the active trace
// once after mount (requestAnimationFrame defers the read until the
// browser-tracing integration has opened the pageload trace).
//
// The link only appears once delivery has settled on ok (useSettledDelivery), so it
// never points at a trace that failed to arrive.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { currentTraceLink } from '../telemetry'
import type { TraceLink } from '../telemetry'
import { useSettledDelivery } from '../delivery'

export function TraceBadge() {
  const [link, setLink] = useState<TraceLink | null>(null)
  const settled = useSettledDelivery()

  const location = useLocation()

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLink(currentTraceLink()))
    return () => cancelAnimationFrame(raf)
  }, [location.key])

  // The connection status lives in the bottom bar (DeliveryStatus); here we only
  // surface the Uptrace link once delivery has settled on ok, so it never points
  // at a trace that failed to arrive.
  let linkNode: ReactNode = null
  if (link && !link.url) {
    linkNode = <span className="trace-badge__label">set VITE_UPTRACE_URL for a link</span>
  } else if (link && link.url && settled?.state === 'ok') {
    linkNode = (
      <a className="trace-badge__cta" href={link.url} target="_blank" rel="noreferrer">
        View in Uptrace ↗
      </a>
    )
  }

  return (
    <div className="trace-badge">
      <span className="trace-badge__label">current trace</span>
      <code className="trace-badge__id">{link?.traceId ?? '—'}</code>
      {linkNode}
    </div>
  )
}
