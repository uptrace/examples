import { useParams } from 'react-router-dom'
import { emitLog, reportError } from '../telemetry'

// ItemRoute is a second route reached from the nav. Navigating here starts a new
// navigation trace named /item/:id; the two controls fire a signal onto THAT
// trace, showing that signals attach to the current route's trace.
export function ItemRoute() {
  const { id } = useParams()
  return (
    <section className="console">
      <header className="console__head">
        <h1>Item {id}</h1>
        <p className="tagline">Navigating here started a new trace. Signals fired here attach to it.</p>
      </header>
      <div className="panel">
        <h2>Fire a signal on this route</h2>
        <div className="panel__actions">
          <button className="btn" onClick={() => emitLog('info', `Viewed item ${id}`)}>
            Emit log here
          </button>
          <button className="btn btn-danger" onClick={() => reportError('Error')}>
            Throw error here
          </button>
        </div>
      </div>
    </section>
  )
}
