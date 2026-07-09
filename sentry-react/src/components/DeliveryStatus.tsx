// DeliveryStatus shows whether the most recent telemetry envelope reached the
// ingest server. It reads the delivery store (src/delivery.ts) — updated by the
// reporting transport — so both success and failure are visible in the UI, not
// just in the devtools Network tab.
import { useSyncExternalStore } from 'react'
import { subscribeDelivery, getDeliverySnapshot } from '../delivery'
import type { DeliveryStatus as Status } from '../delivery'

// message returns the label for a delivery status.
function message(status: Status): string {
  switch (status.state) {
    case 'idle':
      return 'No data sent yet'
    case 'sending':
      return 'Sending to Uptrace…'
    case 'ok':
      return 'Delivered to Uptrace ✓'
    case 'failed':
      return status.host
        ? `Delivery failed — couldn't reach ${status.host} (is it running? DSN correct?)`
        : "Delivery failed — couldn't reach the ingest server (is it running? DSN correct?)"
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
