import { useEffect, useRef, useState } from 'react'
import { startNamedSpan, endNamedSpan } from '../telemetry'
import type { NamedSpan } from '../telemetry'

// SpanPanel: type a name, Start the span, Stop it. The span's duration is the
// time between the two clicks, and it shows in Uptrace under the name you typed.
export function SpanPanel() {
  const [name, setName] = useState('')
  const [running, setRunning] = useState<NamedSpan | null>(null)

  // Mirror `running` into a ref so the unmount cleanup sees the latest value
  // without re-registering the effect (a [running] dep would end the span early
  // on Stop).
  const runningRef = useRef<NamedSpan | null>(null)
  runningRef.current = running

  useEffect(() => {
    // If the panel unmounts (e.g. navigating away) while a span is still open,
    // end it so its duration is recorded instead of being silently dropped.
    return () => {
      if (runningRef.current) {
        endNamedSpan(runningRef.current)
      }
    }
  }, [])

  return (
    <div className="panel">
      <h2>Spans</h2>
      <p>Name a span, start it, stop it. Its duration is the time between clicks.</p>
      <div className="panel__actions">
        <input
          aria-label="Span name"
          placeholder="span name"
          value={name}
          disabled={running !== null}
          onChange={e => setName(e.target.value)}
        />
        {running ? (
          <button
            className="btn"
            onClick={() => {
              endNamedSpan(running)
              setRunning(null)
              setName('')
            }}
          >
            Stop span
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => setRunning(startNamedSpan(name.trim()))}
          >
            Start span
          </button>
        )}
      </div>
    </div>
  )
}
