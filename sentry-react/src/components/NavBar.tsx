import { NavLink } from 'react-router-dom'

// The demo routes, each a real page; navigating mints a new trace named by its
// route pattern. /products/42 uses an arbitrary sample id: Uptrace names its trace
// by the pattern (/products/:id), not the id, and the page's "Next product" link
// lets you confirm other ids group the same way. The last is an unmatched path
// (NotFound).
const ROUTES = [
  { to: '/', label: 'Home' },
  { to: '/products/42', label: 'Products' },
  { to: '/categories', label: 'Categories' },
  { to: '/news', label: 'News' },
  { to: '/settings', label: 'Settings' },
  { to: '/redirect', label: 'Redirect' },
  { to: '/404', label: 'Not found' },
]

// NavBar is the route list. Navigating mints a new trace; the trace badge below
// updates, and the last signal / delivery bar stays at the bottom.
export function NavBar() {
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
