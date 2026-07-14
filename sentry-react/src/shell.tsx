// The persistent app frame: route nav on the left, current-trace badge above the
// routed content, inspector pinned to the bottom.
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { getPageTraceId, subscribePageTrace, uptraceUrl } from './telemetry'
import { useSettledDelivery } from './delivery'
import { Inspector } from './inspector'

// The demo routes. /products/42 uses an arbitrary sample id: Uptrace names its trace
// by the pattern (/products/:id), not the id. The last is an unmatched path.
const ROUTES = [
  { to: '/', label: 'Home' },
  { to: '/products/42', label: 'Products' },
  { to: '/categories', label: 'Categories' },
  { to: '/news', label: 'News' },
  { to: '/settings', label: 'Settings' },
  { to: '/redirect', label: 'Redirect' },
  { to: '/404', label: 'Not found' },
]

// NavBar is the route list; navigating mints a new trace and the badge updates.
function NavBar() {
  return (
    <nav className="nav" aria-label="Routes">
      {ROUTES.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => (isActive ? 'nav__link active' : 'nav__link')}
        >
          <span className="nav__name">{label}</span>
          <span className="nav__path">{to}</span>
        </NavLink>
      ))}
    </nav>
  )
}

// TraceBadge names the current page's trace, and links to it only once delivery has
// settled ok — so the link never points at a trace that never arrived.
function TraceBadge() {
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

export function Layout() {
  return (
    <div className="shell">
      <div className="layout">
        <NavBar />
        <div className="main">
          <div className="statusbar">
            <TraceBadge />
          </div>
          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>
      <Inspector />
    </div>
  )
}
