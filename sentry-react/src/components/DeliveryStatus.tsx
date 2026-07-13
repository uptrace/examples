// DeliveryStatus shows whether the app can reach the ingest server. It reads the
// delivery store (src/delivery.ts) — updated by the reporting transport as each
// envelope is sent — and frames the result as connection health, so it reads
// correctly on page load (the pageload trace is the first thing sent) as well as
// after a demo action. It stays quiet on success and only shows a message when an
// envelope fails to reach Uptrace, so a broken DSN/host is visible without noise.
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
        ? `Uptrace rejected the data (HTTP ${status.statusCode})`
        : "Can't reach Uptrace"
  }
}

export function DeliveryStatus() {
  const status = useSyncExternalStore(subscribeDelivery, getDeliverySnapshot)
  // Stay quiet unless delivery fails: no "Connected"/"Connecting" on every page,
  // only surface a problem when an envelope cannot reach Uptrace.
  if (status.state !== 'failed') {
    return null
  }
  return (
    <div className="delivery" data-state={status.state}>
      <span className="delivery__dot" aria-hidden="true" />
      <span className="delivery__text">{message(status)}</span>
    </div>
  )
}
