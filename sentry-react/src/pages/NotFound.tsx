import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { reportNamedError } from '../telemetry'

// NotFound renders for any unmatched path and reports the 404 to Uptrace as a
// distinct "PageNotFound" issue on its /* navigation trace, so unknown routes are
// trackable (not just a silent navigation).
export function NotFound() {
  const { pathname } = useLocation()
  const reported = useRef<string | null>(null)

  // Report once per path, not once per mount: every unmatched path renders this
  // same catch-all route, so navigating between two of them keeps the component
  // mounted. Remembering the reported path still absorbs StrictMode's dev
  // double-invoke, which re-runs the effect with the pathname unchanged.
  useEffect(() => {
    if (reported.current === pathname) return
    reported.current = pathname
    reportNamedError('PageNotFound', `Page not found: ${pathname}`)
  }, [pathname])

  return (
    <section className="console">
      <p className="tagline">
        No route matches <code>{pathname}</code>. It is reported to Uptrace as a PageNotFound error
        on this route's trace.
      </p>
      <p className="hint">
        <Link className="trace-badge__cta" to="/">
          Back home
        </Link>
      </p>
    </section>
  )
}
