// delivery.ts — observes whether telemetry envelopes actually reach the ingest
// server and publishes the latest outcome to a tiny store the UI subscribes to.
// It wraps the standard fetch transport; it only watches send results, it never
// changes what or how Sentry sends. This is how the app can show "delivered" vs
// "couldn't reach Uptrace" instead of leaving that only in the Network tab.
import * as Sentry from '@sentry/react'

// DeliveryState is the lifecycle of the most recent envelope send.
export type DeliveryState = 'idle' | 'sending' | 'ok' | 'failed'

// DeliveryStatus is the current snapshot shown in the UI. `host` is the ingest
// host from the DSN, used to name the target in the failure message.
export interface DeliveryStatus {
  state: DeliveryState
  statusCode?: number
  host: string | null
}

// hostFromDsn returns the ingest host (e.g. "localhost:5000") from the DSN, or
// null if the DSN is absent or malformed.
function hostFromDsn(dsn: string | undefined): string | null {
  if (!dsn) {
    return null
  }
  try {
    return new URL(dsn).host
  } catch {
    return null
  }
}

const host = hostFromDsn(import.meta.env.VITE_SENTRY_DSN)

// The single current snapshot. getDeliverySnapshot returns this same reference
// until emit() replaces it, so useSyncExternalStore does not re-render in a loop.
let snapshot: DeliveryStatus = { state: 'idle', host }
const listeners = new Set<() => void>()

// emit replaces the snapshot and notifies subscribers. `host` is always carried
// forward so the failure message can name the target.
function emit(next: { state: DeliveryState; statusCode?: number }): void {
  snapshot = { state: next.state, statusCode: next.statusCode, host }
  for (const listener of listeners) {
    listener()
  }
}

// subscribeDelivery registers a listener and returns an unsubscribe function.
export function subscribeDelivery(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// getDeliverySnapshot returns the current status (stable reference between emits).
export function getDeliverySnapshot(): DeliveryStatus {
  return snapshot
}

// makeReportingTransport wraps the standard fetch transport and reports each
// send's outcome. A rejected send (server down / CORS) is a failure; a resolved
// send with an HTTP status >= 400 (rejected token/project) is a failure; anything
// else is a success. The inner result/error is passed through untouched.
export function makeReportingTransport(
  options: Parameters<typeof Sentry.makeFetchTransport>[0],
): ReturnType<typeof Sentry.makeFetchTransport> {
  const inner = Sentry.makeFetchTransport(options)
  return {
    send: async (request) => {
      emit({ state: 'sending' })
      try {
        const result = await inner.send(request)
        const code = result?.statusCode
        // A resolve with no statusCode (or < 400) just means the SDK accepted the
        // send — e.g. it may have dropped/rate-limited items client-side and
        // resolved with `{}` — not a hard guarantee the envelope was delivered.
        emit(
          code && code >= 400
            ? { state: 'failed', statusCode: code }
            : { state: 'ok', statusCode: code },
        )
        return result
      } catch (err) {
        emit({ state: 'failed' })
        throw err
      }
    },
    flush: (timeout) => inner.flush(timeout),
  }
}
