import { emitLog } from '../telemetry'
import type { LogLevel } from '../telemetry'

const LEVELS: LogLevel[] = ['info', 'warn', 'error']

// LogPanel emits a structured log at each level via the Sentry Logs API.
export function LogPanel() {
  return (
    <div className="panel">
      <h2>Logs</h2>
      <p>Emit a structured log at each level.</p>
      <div className="panel__actions">
        {LEVELS.map(level => (
          <button key={level} className="btn" onClick={() => emitLog(level, `Signal Console ${level} log`)}>
            {level}
          </button>
        ))}
      </div>
    </div>
  )
}
