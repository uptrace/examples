// DeliveryStatus makes a broken DSN/host visible: it stays quiet until an envelope
// fails to reach Uptrace (src/delivery.ts observes every send).
import { useSettledDelivery } from '../delivery'
import type { DeliveryStatus as Status } from '../delivery'

function message(status: Status): string {
  switch (status.state) {
    case 'idle':
      return 'Waiting for the first event…'
    case 'sending':
      return 'Connecting to Uptrace…'
    case 'ok':
      return 'Connected to Uptrace ✓'
    case 'failed':
      // A statusCode means the host answered but rejected the data; none means we
      // never reached it, so name the host — a wrong DSN host is the usual cause.
      return status.statusCode
        ? `Uptrace rejected the data (HTTP ${status.statusCode})`
        : `Can't reach Uptrace at ${status.host ?? 'the ingest server'}`
  }
}

export function DeliveryStatus() {
  const settled = useSettledDelivery()
  if (settled?.state !== 'failed') {
    return null
  }
  return (
    <div className="delivery" data-state={settled.state}>
      <span className="delivery__dot" aria-hidden="true" />
      <span className="delivery__text">{message(settled)}</span>
    </div>
  )
}
