import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { reportNamedError } from '../telemetry'

// NotFound renders for any unmatched path and reports the 404 to Uptrace as a
// distinct "PageNotFound" issue on its /* navigation trace, so unknown routes are
// trackable (not just a silent navigation).
export function NotFound() {
  const { pathname } = useLocation()
  const reported = useRef(false)

  // Report once per view. The ref guards against React StrictMode's double-invoke
  // in dev; a real second visit remounts the page and reports again.
  useEffect(() => {
    if (reported.current) return
    reported.current = true
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
