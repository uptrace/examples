import { Outlet } from 'react-router-dom'
import { NavBar } from './NavBar'
import { TraceBadge } from './TraceBadge'
import { Inspector } from './Inspector'

// Layout is the persistent shell: a left nav sidebar, and a main column with the
// current-trace badge and routed content. The inspector is a fixed bottom bar.
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
