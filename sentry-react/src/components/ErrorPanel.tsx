import { reportError } from '../telemetry'
import type { ErrorType } from '../telemetry'

const TYPES: ErrorType[] = ['Error', 'TypeError', 'RangeError', 'SyncError']

// ErrorPanel captures one exception per button — each a distinct type so it is
// intentional and findable in Uptrace.
export function ErrorPanel() {
  return (
    <div className="panel">
      <h2>Errors</h2>
      <p>Each button captures one exception on the current trace.</p>
      <div className="panel__actions">
        {TYPES.map(type => (
          <button key={type} className="btn btn-danger" onClick={() => reportError(type)}>
            {type}
          </button>
        ))}
      </div>
    </div>
  )
}
