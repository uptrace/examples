import { useState } from 'react'
import { sendRequest } from '../telemetry'
import type { RequestKind } from '../telemetry'

const REQUESTS: { kind: RequestKind; label: string }[] = [
  { kind: 'ok', label: 'OK (200)' },
  { kind: 'slow', label: 'Slow (~5s)' },
  { kind: 'fail', label: 'Fail (500)' },
]

// HttpPanel fetches a dev endpoint per button, each producing an http.client
// span on the current trace. The Fail button also captures an error.
export function HttpPanel() {
  const [busy, setBusy] = useState<RequestKind | null>(null)

  return (
    <div className="panel">
      <h2>HTTP</h2>
      <p>Fetch a dev endpoint — each produces an http.client span on the current trace.</p>
      <div className="panel__actions">
        {REQUESTS.map(({ kind, label }) => (
          <button
            key={kind}
            className="btn"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(kind)
              await sendRequest(kind)
              setBusy(null)
            }}
          >
            {busy === kind ? '…' : label}
          </button>
        ))}
      </div>
    </div>
  )
}
