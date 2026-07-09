// TodoList is the whole app: compose, list, filter todos, plus a demo button
// that reports an error. Every action emits its Sentry signal onto the current
// page's trace.
import { useMemo, useState } from 'react'
import { useTodos } from '../todos-context'
import type { Filter } from '../todos-context'
import { captureTestError } from '../telemetry'
import { TraceBadge } from '../components/TraceBadge'
import { DeliveryStatus } from '../components/DeliveryStatus'

export function TodoList() {
  const { todos, filter, addTodo, toggleTodo, deleteTodo, clearCompleted, setFilter } = useTodos()
  const [text, setText] = useState('')

  const remaining = todos.filter((t) => !t.done).length
  const completed = todos.length - remaining
  const visible = useMemo(
    () =>
      todos.filter((t) => {
        if (filter === 'active') return !t.done
        if (filter === 'completed') return t.done
        return true
      }),
    [todos, filter],
  )

  function submit() {
    if (!text.trim()) return
    addTodo(text)
    setText('')
  }

  return (
    <main className="app">
      <header className="masthead">
        <h1>Todo</h1>
        <p className="tagline">React, instrumented with Sentry, reporting to Uptrace.</p>
      </header>

      <div className="composer">
        <input
          aria-label="New todo"
          value={text}
          placeholder="What needs doing?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
          Add
        </button>
      </div>

      <div className="toolbar">
        <span className="count">{remaining} left</span>
        <div className="filters" role="group" aria-label="Filter todos">
          {(['all', 'active', 'completed'] as const).map((f: Filter) => (
            <button
              key={f}
              className="filter"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="btn-text" onClick={clearCompleted} disabled={completed === 0}>
          Clear completed
        </button>
      </div>

      <ul className={visible.length > 10 ? 'todos todos--scroll' : 'todos'}>
        {visible.length === 0 ? (
          <li className="empty">
            {todos.length === 0
              ? 'Nothing here yet. Add your first todo above.'
              : `No ${filter} todos.`}
          </li>
        ) : (
          visible.map((todo) => (
            <li key={todo.id} className="todo">
              <input
                type="checkbox"
                checked={todo.done}
                aria-label={`Complete "${todo.text}"`}
                onChange={() => toggleTodo(todo.id)}
              />
              <span className={todo.done ? 'todo__text done' : 'todo__text'}>{todo.text}</span>
              <button
                className="remove"
                aria-label={`Delete "${todo.text}"`}
                onClick={() => deleteTodo(todo.id)}
              >
                Delete
              </button>
            </li>
          ))
        )}
      </ul>

      <section className="demo" aria-labelledby="demo-heading">
        <h2 id="demo-heading">Send data to Uptrace</h2>
        <div className="demo-actions">
          <button className="btn btn-danger" onClick={captureTestError}>
            Throw test error
          </button>
        </div>
        <p className="hint">
          Adding, completing and deleting todos emit spans and logs on this page's trace. The
          error button reports an exception. All of them share the current trace — it changes
          only when you reload or open a todo.
        </p>
        <TraceBadge />
        <DeliveryStatus />
      </section>
    </main>
  )
}
