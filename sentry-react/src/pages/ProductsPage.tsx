import { Link, useParams } from 'react-router-dom'
import { RoutePage } from '../components/RoutePage'

// The errors this route can report; distinct names become distinct issues in Uptrace.
const ERRORS = [
  { name: 'ProductNotFound', message: 'Product not found' },
  { name: 'ProductCreateFailed', message: 'Product creation failed' },
]

// ProductsPage is the demo's one dynamic route (/products/:id). The id in the URL
// is just a sample; "Next product" navigates to another id so you can watch each
// concrete id mint its own trace while Uptrace names them all by the pattern
// (/products/:id) — every id groups into one route, not a trace per id.
export function ProductsPage() {
  const { id } = useParams()
  const next = (Number(id) || 0) + 1
  return (
    <RoutePage
      subtitle={`Dynamic route /products/:id. id=${id} is just a sample; Uptrace names the trace by the pattern, so every id groups into one route.`}
      errors={ERRORS}
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
