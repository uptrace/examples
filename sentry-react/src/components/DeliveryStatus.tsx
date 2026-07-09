// DeliveryStatus shows whether the app can reach the ingest server. It reads the
// delivery store (src/delivery.ts) — updated by the reporting transport as each
// envelope is sent — and frames the result as connection health, so it reads
// correctly on page load (the pageload trace is the first thing sent) as well as
// after a demo action. Both success and failure are visible in the UI, not just
// in the devtools Network tab.
import { useSyncExternalStore } from 'react'
import { subscribeDelivery, getDeliverySnapshot } from '../delivery'
import type { DeliveryStatus as Status } from '../delivery'

// message returns the label for a delivery status.
function message(status: Status): string {
  switch (status.state) {
    case 'idle':
      return 'Waiting for the first event…'
    case 'sending':
      return 'Connecting to Uptrace…'
    case 'ok':
      return 'Connected to Uptrace ✓'
    case 'failed':
      // A statusCode means the host answered but rejected the data (bad DSN
      // key/project, rate limit); no statusCode means we never reached it.
      return status.statusCode
        ? `Uptrace rejected the data (HTTP ${status.statusCode}) — check the DSN key/project`
        : `Can't reach Uptrace at ${status.host ?? 'the ingest server'} (is it running? DSN correct?)`
  }
}

export function DeliveryStatus() {
  const status = useSyncExternalStore(subscribeDelivery, getDeliverySnapshot)
  return (
    <div className="delivery" data-state={status.state}>
      <span className="delivery__dot" aria-hidden="true" />
      <span className="delivery__text">{message(status)}</span>
    </div>
  )
}
