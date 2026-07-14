// The routed pages. Each navigation mints a new trace named by its route pattern.
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { reportNamedError } from './telemetry'
import { ErrorPanel, HttpPanel, TodoPanel } from './panels'

// Console is the home route: the three signal panels.
export function Console() {
  return (
    <section className="console">
      <div className="panels">
        <TodoPanel />
        <HttpPanel />
        <ErrorPanel />
      </div>
    </section>
  )
}

const PRODUCT_ERRORS = [
  { name: 'ProductNotFound', message: 'Product not found' },
  { name: 'ProductCreateFailed', message: 'Product creation failed' },
]

// ProductsPage is the dynamic route (/products/:id). "Next product" navigates to
// another id, so you can watch every concrete id group into one route in Uptrace.
export function ProductsPage() {
  const { id } = useParams()
  const next = (Number(id) || 0) + 1
  return (
    <RoutePage
      subtitle={`Dynamic route /products/:id. id=${id} is just a sample; Uptrace names the trace by the pattern, so every id groups into one route.`}
      errors={PRODUCT_ERRORS}
      extra={
        <p className="hint">
          <Link className="trace-badge__cta" to={`/products/${next}`}>
            Next product (#{next}) →
          </Link>
        </p>
      }
    />
  )
}

const CATEGORY_ERRORS = [
  { name: 'CategoryNotFound', message: 'Category not found' },
  { name: 'CategoryCreateFailed', message: 'Category creation failed' },
]

// CategoriesPage is a catch-all route (/categories/*): the whole tail is one splat
// param, and Uptrace names the trace /categories/*.
export function CategoriesPage() {
  const tail = useParams()['*'] ?? ''
  return (
    <RoutePage
      subtitle={`Categories. A catch-all route (/categories/*); tail: ${tail || '(none)'}. Trace named /categories/*.`}
      errors={CATEGORY_ERRORS}
    />
  )
}

// NotFound renders for any unmatched path and reports it as a distinct PageNotFound
// issue, so unknown routes are trackable rather than a silent navigation.
export function NotFound() {
  const { pathname } = useLocation()
  const reported = useRef<string | null>(null)

  // Report once per path, not once per mount: every unmatched path renders this same
  // catch-all route, so navigating between two of them keeps the component mounted.
  // Remembering the path still absorbs StrictMode's dev double-invoke, which re-runs
  // the effect with the pathname unchanged.
  useEffect(() => {
    if (reported.current === pathname) return
    reported.current = pathname
    reportNamedError('PageNotFound', `Page not found: ${pathname}`)
  }, [pathname])

  return (
    <section className="console">
      <p className="tagline">
        No route matches <code>{pathname}</code>. It is reported to Uptrace as a PageNotFound error
        on this route's trace.
      </p>
      <p className="hint">
        <Link className="trace-badge__cta" to="/">
          Back home
        </Link>
      </p>
    </section>
  )
}

// RouteError is one domain error a route offers as a button.
export interface RouteError {
  name: string
  message: string
}

// RoutePage is the shared body for the sub-routes: a subtitle plus one button per
// domain error, each attaching to this route's trace. extra renders below it.
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
