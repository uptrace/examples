import { useEffect, useMemo, useState } from 'react'
import * as Sentry from '@sentry/react'

import './App.css'

// A single todo item.
interface Todo {
  id: string
  text: string
  done: boolean
}

// Which todos the list is showing.
type Filter = 'all' | 'active' | 'completed'

const STORAGE_KEY = 'uptrace-sentry-todos'

// App is a small but real todo list: add, complete, filter, delete, and clear
// completed, persisted to localStorage. Every interaction also leaves a Sentry
// breadcrumb, so when an event reaches Uptrace you can see the trail of actions
// that led to it. Two extra buttons exist purely to generate telemetry: one
// throws an error, one runs a traced task (a span).
export default function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [filter, setFilter] = useState<Filter>('all')
  const [text, setText] = useState('')

  // Persist on every change so a reload (or a developer coming back to the tab)
  // keeps the list.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

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

  function addTodo() {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }

    // Wrap the work in a span so adding a todo shows up as a trace in Uptrace.
    Sentry.startSpan({ name: 'add_todo', op: 'ui.action' }, () => {
      setTodos((prev) => [...prev, { id: crypto.randomUUID(), text: trimmed, done: false }])
      setText('')
      breadcrumb(`Added todo "${trimmed}"`)
    })
  }

  function toggleTodo(id: string) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    breadcrumb(`Toggled todo ${id}`)
  }

  function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id))
    breadcrumb(`Deleted todo ${id}`)
  }

  function clearCompleted() {
    setTodos((prev) => prev.filter((t) => !t.done))
    breadcrumb('Cleared completed todos')
  }

  function changeFilter(next: Filter) {
    setFilter(next)
    breadcrumb(`Filtered by "${next}"`)
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
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
        />
        <button className="btn btn-primary" onClick={addTodo}>
          Add
        </button>
      </div>

      <div className="toolbar">
        <span className="count">{remaining} left</span>
        <div className="filters" role="group" aria-label="Filter todos">
          {(['all', 'active', 'completed'] as const).map((f) => (
            <button
              key={f}
              className="filter"
              aria-pressed={filter === f}
              onClick={() => changeFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="btn-text" onClick={clearCompleted} disabled={completed === 0}>
          Clear completed
        </button>
      </div>

      <ul className="todos">
        {visible.length === 0 ? (
          <li className="empty">
            {todos.length === 0
              ? 'Nothing here yet. Add your first todo above.'
              : `No ${filter} todos.`}
          </li>
        ) : (
          visible.map((todo) => (
            <li key={todo.id} className="todo">
              <label className={todo.done ? 'done' : ''}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo.id)}
                />
                <span>{todo.text}</span>
              </label>
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
          <button className="btn btn-quiet" onClick={runTracedTask}>
            Run traced task
          </button>
          <button className="btn btn-quiet" onClick={sendTestMessage}>
            Send log message
          </button>
          <button className="btn btn-danger" onClick={throwTestError}>
            Throw test error
          </button>
        </div>
        <p className="hint">
          Each button sends a different signal. Click a few times, then open your project in
          Uptrace to see the spans, messages, and errors.
        </p>
      </section>
    </main>
  )
}

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event sent to Uptrace.
function breadcrumb(message: string) {
  Sentry.addBreadcrumb({ category: 'todo', message, level: 'info' })
}

// A severity level Sentry understands. Kept local so we don't import a type.
type Level = 'info' | 'warning' | 'error'

// MESSAGES are log-style events sent with Sentry.captureMessage. Picking one at
// random gives Uptrace a mix of levels to display.
const MESSAGES: ReadonlyArray<readonly [string, Level]> = [
  ['Todos synced with the backend', 'info'],
  ['Todo sync retried after a timeout', 'warning'],
  ['Could not reach the sync backend', 'error'],
]

// ERRORS are the demo failures. Varied types and messages so Uptrace groups
// them as distinct issues instead of one repeated error. Each is built fresh on
// throw so its stack trace points at the app, not this list.
const ERRORS: ReadonlyArray<() => Error> = [
  () => new Error('Example error from the React Todo app'),
  () => new TypeError("Cannot read properties of undefined (reading 'text')"),
  () => new RangeError('Todo limit of 100 exceeded'),
  () => Object.assign(new Error('Failed to sync todos: network request timed out'), {
    name: 'TodoSyncError',
  }),
]

// sendTestMessage captures a random log message at its level. This is a handled
// (non-error) event, the "send" counterpart to throwing.
function sendTestMessage() {
  const [message, level] = pickRandom(MESSAGES)
  breadcrumb(`Sent a ${level} message`)
  Sentry.captureMessage(message, level)
}

// throwTestError simulates a real app operation that fails a few calls deep, so
// the error reported to Uptrace has app frames in its stack trace (syncTodos ->
// buildSyncPayload) instead of only the React internals that call the handler.
// The app does not catch it, so Sentry's global handler captures and reports it.
function throwTestError() {
  breadcrumb('About to throw a test error')
  syncTodos()
}

// syncTodos pretends to push the saved todos to a backend.
function syncTodos() {
  const payload = buildSyncPayload(loadTodos())
  console.debug('would send payload', payload)
}

// buildSyncPayload pretends to serialize the todos, but always fails here on
// purpose with a randomly chosen error. (The length check is just to keep the
// return reachable for the type checker.)
function buildSyncPayload(todos: Todo[]): string {
  if (todos.length >= 0) {
    throw pickRandom(ERRORS)()
  }
  return JSON.stringify(todos)
}

// pickRandom returns a random element of a non-empty array.
function pickRandom<T>(items: ReadonlyArray<T>): T {
  return items[Math.floor(Math.random() * items.length)]
}

// runTracedTask runs fake async work inside a span. The span and its children
// appear as a trace in Uptrace.
async function runTracedTask() {
  await Sentry.startSpan({ name: 'run_traced_task', op: 'task' }, async () => {
    await Sentry.startSpan({ name: 'step_one', op: 'task.step' }, () => wait(150))
    await Sentry.startSpan({ name: 'step_two', op: 'task.step' }, () => wait(250))
  })
}

// loadTodos reads the persisted list, tolerating absent or corrupt storage.
function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Todo[]) : []
  } catch {
    return []
  }
}

// wait resolves after `ms` milliseconds, standing in for real async work.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
