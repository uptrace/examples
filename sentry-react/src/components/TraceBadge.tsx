// TraceBadge shows the trace id of the current page and a link to it in Uptrace.
// It reads the active trace on each navigation (keyed on location) and keeps
// showing that id until the next navigation — so you can watch the id change
// ONLY on reload and route change, never on a button click. requestAnimationFrame
// defers the read until after the router integration has opened the new trace.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { currentTraceLink } from '../telemetry'
import type { TraceLink } from '../telemetry'

export function TraceBadge() {
  const location = useLocation()
  const [link, setLink] = useState<TraceLink | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLink(currentTraceLink()))
    return () => cancelAnimationFrame(raf)
  }, [location.key])

  return (
    <div className="trace-badge">
      <span className="trace-badge__label">current trace</span>
      <code className="trace-badge__id">{link?.traceId ?? '—'}</code>
      {link?.url ? (
        <a className="trace-badge__cta" href={link.url} target="_blank" rel="noreferrer">
          View in Uptrace ↗
        </a>
      ) : (
        <span className="trace-badge__label">set VITE_UPTRACE_URL for a link</span>
      )}
    </div>
  )
}
