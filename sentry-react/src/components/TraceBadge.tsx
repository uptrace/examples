// TraceBadge shows the trace id of the current page load and — once telemetry is
// confirmed reaching Uptrace — a link to that trace. It reads the active trace
// once after mount (requestAnimationFrame defers the read until the
// browser-tracing integration has opened the pageload trace).
//
// The link is gated on the last *settled* delivery result (ok/failed), not the
// live state: showing it optimistically would flash a link on load that vanishes
// when the first envelope fails, and hiding it during every transient "sending"
// would make it flicker on each action. So we remember the last ok/failed and
// only show the link once delivery has settled on ok.
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { currentTraceLink } from '../telemetry'
import type { TraceLink } from '../telemetry'
import { subscribeDelivery, getDeliverySnapshot } from '../delivery'

export function TraceBadge() {
  const [link, setLink] = useState<TraceLink | null>(null)
  const delivery = useSyncExternalStore(subscribeDelivery, getDeliverySnapshot)

  // The last confirmed delivery outcome, ignoring the transient idle/sending.
  const [settled, setSettled] = useState<'ok' | 'failed' | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLink(currentTraceLink()))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (delivery.state === 'ok' || delivery.state === 'failed') {
      setSettled(delivery.state)
    }
  }, [delivery.state])

  let linkNode: ReactNode = null
  if (link && !link.url) {
    linkNode = <span className="trace-badge__label">set VITE_UPTRACE_URL for a link</span>
  } else if (link && link.url && settled === 'failed') {
    linkNode = <span className="trace-badge__label">not delivered</span>
  } else if (link && link.url && settled === 'ok') {
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
