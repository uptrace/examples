import { ErrorPanel } from '../components/ErrorPanel'
import { HttpPanel } from '../components/HttpPanel'
import { TodoPanel } from '../components/TodoPanel'

// Console is the home route: the signal panels. Navigation to the other routes
// lives in the side nav.
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
