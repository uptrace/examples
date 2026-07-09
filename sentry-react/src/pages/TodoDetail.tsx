// TodoDetail is the `/todo/:id` route. Reaching it is a navigation, so the SDK
// opens a new navigation trace named by the parameterized path `/todo/:id`.
import { Link, useParams } from 'react-router-dom'
import { useTodos } from '../todos-context'
import { TraceBadge } from '../components/TraceBadge'
import { DeliveryStatus } from '../components/DeliveryStatus'

export function TodoDetail() {
  const { id } = useParams()
  const { todos, toggleTodo, deleteTodo } = useTodos()
  const todo = todos.find((t) => t.id === id)

  return (
    <main className="app">
      <p>
        <Link to="/" className="detail__back">
          ← All todos
        </Link>
      </p>

      {todo ? (
        <>
          <h1 className={todo.done ? 'detail__title done' : 'detail__title'}>{todo.text}</h1>
          <p className="tagline">{todo.done ? 'Completed' : 'Active'}</p>
          <div className="demo-actions">
            <button className="btn btn-quiet" onClick={() => toggleTodo(todo.id)}>
              {todo.done ? 'Mark active' : 'Mark done'}
            </button>
            <button className="btn btn-danger" onClick={() => deleteTodo(todo.id)}>
              Delete
            </button>
          </div>
        </>
      ) : (
        <p className="empty">This todo no longer exists.</p>
      )}

      <TraceBadge />
      <DeliveryStatus />
    </main>
  )
}
