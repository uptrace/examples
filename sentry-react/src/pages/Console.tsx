import { ErrorPanel } from '../components/ErrorPanel'
import { SpanPanel } from '../components/SpanPanel'

// Console is the home route: a header plus the signal panels (added in later
// tasks). Every panel's controls fire a Sentry signal onto the current trace.
export function Console() {
  return (
    <section className="console">
      <header className="console__head">
        <h1>Signal Console</h1>
        <p className="tagline">Each control sends one Sentry signal to Uptrace.</p>
      </header>
      <div className="panels">
        <SpanPanel />
        <ErrorPanel />
      </div>
    </section>
  )
}
