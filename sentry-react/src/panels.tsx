// The three demo controls on the home route. Each fires one explicit Sentry signal.
import { useState } from 'react'
import { completeTodo, createTodo, reportError, sendRequest, uptraceUrl } from './telemetry'
import type { ErrorType, RequestKind, Todo } from './telemetry'
import { useSettledDelivery } from './delivery'

// TodoPanel: add a todo (sends a "created" span) and mark it Done (sends a "completed"
// span whose duration is how long the todo was open).
export function TodoPanel() {
  const [text, setText] = useState('')
  const [todos, setTodos] = useState<Todo[]>([])
  // Only link a span once delivery has settled ok: one that never reached Uptrace has
  // nothing to open there.
  const delivered = useSettledDelivery()?.state === 'ok'

  function add() {
    const trimmed = text.trim()
    if (!trimmed) return
    // createTodo sends the span, so it stays out of the updater: StrictMode
    // double-invokes updaters in dev, which would send it twice.
    const todo = createTodo(trimmed)
    setTodos((prev) => [...prev, todo])
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
            const url = delivered ? uptraceUrl(todo.traceId, todo.spanId) : null
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

const REQUESTS: { kind: RequestKind; label: string }[] = [
  { kind: 'ok', label: 'OK (200)' },
  { kind: 'fail', label: 'Fail (500)' },
  { kind: 'slow', label: 'Slow (~5s)' },
]

// HttpPanel fetches a dev endpoint per button. Fail also captures an error.
export function HttpPanel() {
  const [busy, setBusy] = useState<RequestKind | null>(null)

  return (
    <div className="panel">
      <h2>HTTP</h2>
      <p>Fetch a dev endpoint — each produces a request span on the current trace.</p>
      <div className="panel__actions">
        {REQUESTS.map(({ kind, label }) => (
          <button
            key={kind}
            className="btn"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(kind)
              await sendRequest(kind)
              setBusy(null)
            }}
          >
            {busy === kind ? '…' : label}
          </button>
        ))}
      </div>
    </div>
  )
}

const TYPES: ErrorType[] = ['Error', 'TypeError', 'RangeError', 'SyncError']

// ErrorPanel captures one exception per button — each a distinct type, so each is a
// distinct issue in Uptrace.
export function ErrorPanel() {
  return (
    <div className="panel">
      <h2>Errors</h2>
      <p>Each button captures one exception on the current trace.</p>
      <div className="panel__actions">
        {TYPES.map((type) => (
          <button key={type} className="btn btn-danger" onClick={() => reportError(type)}>
            {type}
          </button>
        ))}
      </div>
    </div>
  )
}
