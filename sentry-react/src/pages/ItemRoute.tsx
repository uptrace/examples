import { useParams } from 'react-router-dom'

// ItemRoute is a second route reached from the nav. Navigating here starts a new
// navigation trace named /item/:id; signals fired here attach to that trace
// (controls added in Task 7).
export function ItemRoute() {
  const { id } = useParams()
  return (
    <section className="console">
      <header className="console__head">
        <h1>Item {id}</h1>
        <p className="tagline">Navigating here started a new trace. Signals fired here attach to it.</p>
      </header>
    </section>
  )
}
