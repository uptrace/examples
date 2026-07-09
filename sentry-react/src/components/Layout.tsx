import { Outlet } from 'react-router-dom'
import { NavBar } from './NavBar'
import { TraceBadge } from './TraceBadge'
import { DeliveryStatus } from './DeliveryStatus'
import { Inspector } from './Inspector'

// Layout is the persistent shell around every route: nav, the current-trace
// badge, the delivery-status line, and the routed content.
export function Layout() {
  return (
    <div className="shell">
      <NavBar />
      <div className="statusbar">
        <TraceBadge />
        <DeliveryStatus />
      </div>
      <main className="content">
        <Outlet />
      </main>
      <Inspector />
    </div>
  )
}
