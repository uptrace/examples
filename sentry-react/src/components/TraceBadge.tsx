// TraceBadge shows the trace id of the current page load and — when telemetry is
// actually reaching Uptrace — a link to that trace. It reads the active trace
// once after mount (requestAnimationFrame defers the read until the
// browser-tracing integration has opened the pageload trace) and watches the
// delivery status: if data isn't reaching Uptrace, a "View in Uptrace" link would
// point at a trace that never arrived, so it is replaced with a note instead.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { currentTraceLink } from '../telemetry'
import type { TraceLink } from '../telemetry'
import { subscribeDelivery, getDeliverySnapshot } from '../delivery'

export function TraceBadge() {
  const [link, setLink] = useState<TraceLink | null>(null)
  const delivery = useSyncExternalStore(subscribeDelivery, getDeliverySnapshot)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLink(currentTraceLink()))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Only offer the link when telemetry is getting through; a failed delivery
  // would link to a trace that never reached Uptrace.
  const linkNode =
    delivery.state === 'failed' ? (
      <span className="trace-badge__label">not delivered</span>
    ) : link?.url ? (
      <a className="trace-badge__cta" href={link.url} target="_blank" rel="noreferrer">
        View in Uptrace ↗
      </a>
    ) : (
      <span className="trace-badge__label">set VITE_UPTRACE_URL for a link</span>
    )

  return (
    <div className="trace-badge">
      <span className="trace-badge__label">current trace</span>
      <code className="trace-badge__id">{link?.traceId ?? '—'}</code>
      {linkNode}
    </div>
  )
}
