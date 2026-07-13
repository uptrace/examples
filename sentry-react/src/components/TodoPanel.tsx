import { useState } from 'react'
import { completeTodo, createTodo, uptraceUrl } from '../telemetry'
import type { Todo } from '../telemetry'

// TodoPanel: add a todo (sends a "created" span) and mark it Done (sends a
// "completed" span whose duration is how long the todo was open). Both spans nest
// under the page's trace.
export function TodoPanel() {
  const [text, setText] = useState('')
  const [todos, setTodos] = useState<Todo[]>([])

  function add() {
    const trimmed = text.trim()
    if (!trimmed) return
    setTodos((prev) => [...prev, createTodo(trimmed)])
    setText('')
  }

  function done(todo: Todo) {
    completeTodo(todo)
    setTodos((prev) => prev.filter((t) => t.id !== todo.id))
  }

  return (
    <div className="panel">
      <h2>Todos</h2>
      <p>Add a todo, then mark it Done.</p>
      <div className="panel__actions">
        <input
          aria-label="Todo text"
          placeholder="new todo"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button className="btn btn-primary" disabled={!text.trim()} onClick={add}>
          Add
        </button>
      </div>
      {todos.length > 0 && (
        <ul className="todos">
          {todos.map((todo) => {
            const url = uptraceUrl(todo.traceId, todo.spanId)
            return (
              <li key={todo.id} className="todo">
                <span className="todo__text">{todo.text}</span>
                {url && (
                  <a
                    className="todo__link"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    title="View the created span in Uptrace"
                  >
                    ↗
                  </a>
                )}
                <button className="btn" onClick={() => done(todo)}>
                  Done
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
