import { useMemo, useState } from 'react'
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

// Base URL of your Uptrace UI (its site URL, e.g. http://localhost:5000), used
// to build a link to each trace. Optional: without it we still log the trace id.
const UPTRACE_URL = import.meta.env.VITE_UPTRACE_URL

// Project id, taken from the last path segment of the Sentry DSN. The trace link
// is project-scoped (/explore/<projectId>/traces/<traceId>), so we need it.
const PROJECT_ID = projectIdFromDsn(import.meta.env.VITE_SENTRY_DSN)

// The kind of signal a demo action produced, used to color the result.
type Signal = 'trace' | 'log' | 'error'

// TraceLink describes one signal sent to Uptrace, for the console and the feed.
interface TraceLink {
  kind: Signal
  label: string
  traceId: string
  url: string | null
}

// App is a small todo list: add, complete, filter, delete, and clear completed.
// State is in memory only. Every interaction also leaves a Sentry breadcrumb, so
// when an event reaches Uptrace you can see the trail of actions that led to it.
// Two extra buttons exist purely to generate telemetry: one throws an error, one
// runs a traced task (a span).
export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [text, setText] = useState('')
  // A running feed of signals sent to Uptrace, newest first, capped.
  const [sent, setSent] = useState<TraceLink[]>([])
  const recordTrace = (link: TraceLink) => setSent((prev) => [link, ...prev].slice(0, 8))

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

    const id = crypto.randomUUID()
    setTodos((prev) => [{ id, text: trimmed, done: false }, ...prev])
    setText('')
    breadcrumb(`Added todo "${trimmed}"`)
    // A real interaction, reported as a structured info log rather than a span:
    // the entered text and id ride along as queryable attributes (tags_todo_*),
    // and the breadcrumb trail links back to this log on the trace's Events tab.
    // startNewTrace gives each add its own trace so repeated adds stay distinct.
    Sentry.startNewTrace(() => {
      Sentry.captureMessage(`Added todo "${trimmed}"`, {
        level: 'info',
        tags: { todo_text: trimmed, todo_id: id },
      })
      const traceId = Sentry.getCurrentScope().getPropagationContext().traceId
      recordTrace(announce('log', 'Added todo', traceId))
    })
  }

  function toggleTodo(id: string) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    breadcrumb(`Toggled todo ${id}`)
  }

  function deleteTodo(id: string) {
    const removed = todos.find((t) => t.id === id)
    setTodos((prev) => prev.filter((t) => t.id !== id))
    breadcrumb(`Deleted todo "${removed?.text ?? id}"`)
    // Mirror addTodo: report the removal as a structured info log with the todo's
    // text and id as queryable attributes, on its own trace so the breadcrumb
    // trail links back to it in Uptrace.
    Sentry.startNewTrace(() => {
      Sentry.captureMessage(`Deleted todo "${removed?.text ?? id}"`, {
        level: 'info',
        tags: { todo_text: removed?.text ?? '', todo_id: id },
      })
      const traceId = Sentry.getCurrentScope().getPropagationContext().traceId
      recordTrace(announce('log', 'Deleted todo', traceId))
    })
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
        <button className="btn btn-primary" onClick={addTodo} disabled={!text.trim()}>
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
          <button className="btn btn-quiet" onClick={() => runTracedTask(recordTrace)}>
            Run traced task
          </button>
          <button className="btn btn-quiet" onClick={() => sendTestMessage(recordTrace)}>
            Send log message
          </button>
          <button className="btn btn-danger" onClick={() => throwTestError(recordTrace)}>
            Throw test error
          </button>
        </div>
        {sent.length > 0 ? (
          <ul className="feed">
            {sent.map((s) => (
              <li className="feed__row" data-kind={s.kind} key={s.traceId}>
                <span className="feed__dot" aria-hidden="true" />
                <span className="feed__label">{s.label}</span>
                <code className="feed__id">{s.traceId}</code>
                {s.url ? (
                  <a className="feed__cta" href={s.url} target="_blank" rel="noreferrer">
                    View ↗
                  </a>
                ) : (
                  <span className="feed__hint">no link</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            Every action here, and adding a todo, is traced. Each one prints its trace to the
            console and appears below with a link to Uptrace.
          </p>
        )}
      </section>
    </main>
  )
}

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event sent to Uptrace.
function breadcrumb(message: string) {
  Sentry.addBreadcrumb({ category: 'todo', message, level: 'info' })
}

// announce logs the trace to the console and returns a link for the UI. Span
// actions deep-link to their own span to land on the right place (the error,
// the task); a log has no span of its own, so it links to the trace and omits
// the span id.
function announce(kind: Signal, label: string, traceId: string, spanId?: string): TraceLink {
  const url = traceUrl(traceId, spanId)
  console.log(
    `[uptrace] ${label} sent on trace ${traceId}`,
    url ?? '(set VITE_UPTRACE_URL to get a link)',
  )
  return { kind, label, traceId, url }
}

// traceUrl builds a link into a trace in the Uptrace UI, optionally deep-linking
// to a span within it. We use the project-scoped /explore route; the bare
// /traces/<id> shortcut can 404.
function traceUrl(traceId: string, spanId?: string): string | null {
  if (!UPTRACE_URL || !PROJECT_ID) {
    return null
  }
  const base = `${UPTRACE_URL.replace(/\/+$/, '')}/explore/${PROJECT_ID}/traces/${traceId}`
  return spanId ? `${base}/${spanId}` : base
}

// projectIdFromDsn returns the project id, the last path segment of the DSN
// (e.g. "2" in http://token@host/2), or null if the DSN is absent or malformed.
function projectIdFromDsn(dsn: string | undefined): string | null {
  if (!dsn) {
    return null
  }
  try {
    const segments = new URL(dsn).pathname.split('/').filter(Boolean)
    return segments.at(-1) ?? null
  } catch {
    return null
  }
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
// (non-error) event, the "send" counterpart to throwing. It runs in its own
// trace so we can link to it.
function sendTestMessage(onTrace: (link: TraceLink) => void) {
  const [message, level] = pickRandom(MESSAGES)
  breadcrumb(`Sent a ${level} message`)
  // startNewTrace gives each click its own trace, so repeated clicks are
  // distinct in Uptrace rather than sharing the page's trace.
  Sentry.startNewTrace(() => {
    Sentry.startSpan({ name: 'send_log_message', op: 'task' }, (span) => {
      Sentry.captureMessage(message, level)
      onTrace(announce('log', `Message (${level})`, span.spanContext().traceId, span.spanContext().spanId))
    })
  })
}

// throwTestError simulates a real backend sync that logs its progress and then
// fails, so a single trace carries several Logs & Errors records (an info, then
// a warning, then the error) instead of just one. Each record inherits the
// breadcrumb trail of the actions before it, so in Uptrace the Events tab links
// back to every row on the trace. The failure runs a few calls deep (syncTodos
// -> buildSyncPayload) so the error's stack trace has app frames, not just React
// internals; we catch and report it with captureException so it lands on this
// trace and we can link to it.
function throwTestError(onTrace: (link: TraceLink) => void) {
  Sentry.startNewTrace(() => {
    Sentry.startSpan({ name: 'sync_todos', op: 'task' }, (span) => {
      breadcrumb('Syncing todos with the backend')
      Sentry.captureMessage('Syncing todos with the backend', 'info')

      breadcrumb('Sync timed out, retrying')
      Sentry.captureMessage('Todo sync retried after a timeout', 'warning')

      breadcrumb('Retry failed, giving up')
      try {
        syncTodos()
      } catch (err) {
        Sentry.captureException(err)
      }

      onTrace(announce('error', 'Sync failed', span.spanContext().traceId, span.spanContext().spanId))
    })
  })
}

// syncTodos pretends to push the todos to a backend.
function syncTodos() {
  const payload = buildSyncPayload()
  console.debug('would send payload', payload)
}

// buildSyncPayload pretends to serialize the todos, but always fails here on
// purpose with a randomly chosen error.
function buildSyncPayload(): string {
  throw pickRandom(ERRORS)()
}

// pickRandom returns a random element of a non-empty array.
function pickRandom<T>(items: ReadonlyArray<T>): T {
  return items[Math.floor(Math.random() * items.length)]
}

// runTracedTask runs fake async work inside a span. The span and its children
// appear as a trace in Uptrace. The trace id is reported as soon as the parent
// span opens, while the child spans keep running.
async function runTracedTask(onTrace: (link: TraceLink) => void) {
  await Sentry.startNewTrace(() =>
    Sentry.startSpan({ name: 'run_traced_task', op: 'task' }, async (span) => {
      onTrace(announce('trace', 'Traced task', span.spanContext().traceId, span.spanContext().spanId))
      await Sentry.startSpan({ name: 'step_one', op: 'task.step' }, () => wait(150))
      await Sentry.startSpan({ name: 'step_two', op: 'task.step' }, () => wait(250))
    }),
  )
}

// wait resolves after `ms` milliseconds, standing in for real async work.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
