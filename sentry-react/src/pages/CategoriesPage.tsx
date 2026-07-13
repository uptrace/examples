import { useParams } from 'react-router-dom'
import { RoutePage } from '../components/RoutePage'

// The errors this route can report; distinct names become distinct issues in Uptrace.
const ERRORS = [
  { name: 'CategoryNotFound', message: 'Category not found' },
  { name: 'CategoryCreateFailed', message: 'Category creation failed' },
]

// CategoriesPage is a catch-all route (/categories/*). The whole tail is one splat
// param, and Uptrace names the trace /categories/*.
export function CategoriesPage() {
  const tail = useParams()['*'] ?? ''
  return (
    <RoutePage
      subtitle={`Categories. A catch-all route (/categories/*); tail: ${tail || '(none)'}. Trace named /categories/*.`}
      errors={ERRORS}
    />
  )
}
