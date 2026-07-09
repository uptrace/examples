// TraceBadge shows the trace id of the current page load and a link to it in
// Uptrace. It reads the active trace once, shortly after mount —
// requestAnimationFrame defers the read until the browser-tracing integration
// has opened the pageload trace. The id changes only when you reload the page.
import { useEffect, useState } from 'react'
import { currentTraceLink } from '../telemetry'
import type { TraceLink } from '../telemetry'

export function TraceBadge() {
  const [link, setLink] = useState<TraceLink | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLink(currentTraceLink()))
    return () => cancelAnimationFrame(raf)
  }, [])

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
