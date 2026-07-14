import type { ReactNode } from 'react'
import { reportNamedError } from '../telemetry'

// RouteError is one domain error a route offers as a button.
export interface RouteError {
  name: string
  message: string
}

// RoutePage is the shared body for the demo sub-routes: a subtitle plus one button
// per domain error, each attaching to this route's trace. extra renders below it.
export function RoutePage({
  subtitle,
  errors,
  extra,
}: {
  subtitle: string
  errors: RouteError[]
  extra?: ReactNode
}) {
  return (
    <section className="console">
      <p className="tagline">{subtitle}</p>
      {extra}
      <div className="panels">
        <div className="panel">
          <h2>Errors</h2>
          <p>Each error attaches to this route's trace.</p>
          <div className="panel__actions">
            {errors.map((e) => (
              <button
                key={e.name}
                className="btn btn-danger"
                onClick={() => reportNamedError(e.name, e.message)}
              >
                {e.message}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
