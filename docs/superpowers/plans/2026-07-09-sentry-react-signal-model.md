# sentry-react Signal-Model Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the `sentry-react` example so each todo action maps to the correct Sentry signal (span / log / error) using real APIs, with trace boundaries that match the browser SDK (new trace only on pageload/navigation).

**Architecture:** All Sentry-usage logic lives in one pure module (`src/telemetry.ts`). Todo state + action→telemetry wiring lives in a React context (`src/todos-context.tsx`). Two routed pages (`/`, `/todo/:id`) render the UI. `src/instrument.ts` swaps to the react-router tracing integration and enables logs. No app code ever starts a trace.

**Tech Stack:** React 19, TypeScript (strict), Vite 6, `@sentry/react` v10, `react-router-dom` v7 (declarative routing with Sentry's v6 integration).

## Global Constraints

- Working directory: `examples/sentry-react` (git root is `examples/`).
- **No unit-test harness** and adding one is out of scope. The verification cycle for every task is: `npm run build` (runs `tsc -b` + `vite build`; the typecheck is the guardrail) must pass clean, plus any manual browser check the task names. Do NOT add a test runner.
- TypeScript `strict`, plus `noUnusedLocals` / `noUnusedParameters` are on — no unused imports/vars or the build fails.
- Comments use `//` line comments, including on exported types/functions.
- Plain CSS only. Tokens live in `src/index.css` `:root`; component styles in `src/App.css`. No Tailwind/CSS-in-JS/component libs.
- Never hardcode a DSN; it comes from `VITE_SENTRY_DSN`.
- No app code may call `Sentry.startNewTrace()` — that is the exact anti-pattern being removed.
- Commit after each task with the shown message.

---

### Task 1: Telemetry module + router dependency

**Files:**
- Modify: `package.json` (declare `react-router-dom`)
- Create: `src/telemetry.ts`

**Interfaces:**
- Produces:
  - `breadcrumb(message: string): void`
  - `openTodoSpan(id: string, text: string): Sentry.Span`
  - `endTodoSpan(span: Sentry.Span, opts?: { cancelled?: boolean }): void`
  - `logAdded(id: string, text: string): void`
  - `logDeleted(id: string, text: string): void`
  - `captureTestError(): void`
  - `syncTodos(count: number): Promise<void>`
  - `interface TraceLink { traceId: string; url: string | null }`
  - `currentTraceLink(): TraceLink | null`

- [ ] **Step 1: Declare react-router-dom in package.json**

`react-router-dom` v7 is already present in `node_modules` but undeclared. Add it to `dependencies` in `package.json` (keep alphabetical grouping with the other runtime deps):

```json
  "dependencies": {
    "@sentry/react": "^10.57.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.18.0"
  },
```

- [ ] **Step 2: Run install to sync the lockfile**

Run: `npm install`
Expected: completes without errors; `react-router-dom` now in `package.json` + lockfile.

- [ ] **Step 3: Create `src/telemetry.ts` with the full module**

```ts
// telemetry.ts — every Sentry SDK call the app makes lives here, isolated from
// the UI. Nothing in this file starts a new trace: spans, logs and errors all
// attach to the trace the browser-tracing integration opened for the current
// page load or navigation. That is the whole point of the example — signals
// share the current route's trace instead of each minting its own.
import * as Sentry from '@sentry/react'

// Base URL of the Uptrace UI (e.g. http://localhost:5000), used to build a link
// to the current trace. Optional: without it the badge still shows the trace id.
const UPTRACE_URL = import.meta.env.VITE_UPTRACE_URL

// Project id, taken from the last path segment of the DSN. The trace link is
// project-scoped (/explore/<projectId>/traces/<traceId>), so we need it.
const PROJECT_ID = projectIdFromDsn(import.meta.env.VITE_SENTRY_DSN)

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event later sent on this trace.
export function breadcrumb(message: string): void {
  Sentry.addBreadcrumb({ category: 'todo', message, level: 'info' })
}

// openTodoSpan starts an inactive span standing for an open todo. The caller
// holds the span and ends it when the todo is completed or deleted, so the
// span's duration measures how long the todo stayed open. It is an inactive
// span (startInactiveSpan, not startSpan) precisely because its lifetime is a
// user's, not a function call's. No startNewTrace: it joins the current trace.
export function openTodoSpan(id: string, text: string): Sentry.Span {
  return Sentry.startInactiveSpan({
    name: 'todo.open',
    op: 'todo',
    attributes: { todo_id: id, todo_text: text },
  })
}

// endTodoSpan closes a todo's span. When the todo was removed before being
// completed we tag it cancelled so the two outcomes are distinguishable.
export function endTodoSpan(span: Sentry.Span, opts?: { cancelled?: boolean }): void {
  if (opts?.cancelled) {
    span.setAttribute('cancelled', true)
  }
  span.end()
}

// logAdded / logDeleted emit real structured logs via the Sentry Logs API
// (enabled with enableLogs in instrument.ts). This is NOT captureMessage, which
// produces message events; logger.* is how Sentry models logs. The todo id and
// text ride along as queryable attributes.
export function logAdded(id: string, text: string): void {
  Sentry.logger.info('Added todo', { todo_id: id, todo_text: text })
}

export function logDeleted(id: string, text: string): void {
  Sentry.logger.info('Deleted todo', { todo_id: id, todo_text: text })
}

// ERRORS are the demo failures. Varied types and messages so Uptrace groups
// them as distinct issues instead of one repeated error. Each is built fresh on
// use so its stack trace points at the app.
const ERRORS: ReadonlyArray<() => Error> = [
  () => new Error('Example error from the React Todo app'),
  () => new TypeError("Cannot read properties of undefined (reading 'text')"),
  () => new RangeError('Todo limit of 100 exceeded'),
  () =>
    Object.assign(new Error('Failed to sync todos: network request timed out'), {
      name: 'TodoSyncError',
    }),
]

// captureTestError reports a random error on the CURRENT trace. captureException
// does not start a trace, so firing this twice on one page yields two errors
// that share the page's trace id.
export function captureTestError(): void {
  breadcrumb('Reporting a test error')
  Sentry.captureException(pickRandom(ERRORS)())
}

// syncTodos demonstrates nested wrapping spans. startSpan measures the callback
// and auto-ends the span; the parent 'sync_todos' has 'serialize' and 'upload'
// children with real awaited durations. The upload fails part of the time,
// producing an error attached to the same trace, nested under its span.
export async function syncTodos(count: number): Promise<void> {
  breadcrumb(`Syncing ${count} todos`)
  await Sentry.startSpan(
    { name: 'sync_todos', op: 'task', attributes: { count } },
    async () => {
      await Sentry.startSpan({ name: 'serialize', op: 'task.step' }, () => wait(150))
      await Sentry.startSpan({ name: 'upload', op: 'task.step' }, async () => {
        await wait(250)
        if (Math.random() < 0.5) {
          throw pickRandom(ERRORS)()
        }
      })
    },
  ).catch((err) => {
    // startSpan already marked the spans errored and rethrew; report the error
    // so it lands on this trace, then swallow it (the UI stays responsive).
    Sentry.captureException(err)
  })
}

// TraceLink is the current trace id plus an optional deep link to it in Uptrace.
export interface TraceLink {
  traceId: string
  url: string | null
}

// currentTraceLink reads the trace id of the active root span — the pageload or
// navigation trace the integration opened — and builds a link to it. Read it
// right after a navigation, while that idle span is still active.
export function currentTraceLink(): TraceLink | null {
  const active = Sentry.getActiveSpan()
  const root = active ? Sentry.getRootSpan(active) : undefined
  if (!root) {
    return null
  }
  const { traceId } = root.spanContext()
  return { traceId, url: traceUrl(traceId) }
}

// traceUrl builds a project-scoped link into a trace in the Uptrace UI, or null
// when the UI URL or project id is unavailable.
function traceUrl(traceId: string): string | null {
  if (!UPTRACE_URL || !PROJECT_ID) {
    return null
  }
  const base = UPTRACE_URL.replace(/\/+$/, '')
  return `${base}/explore/${PROJECT_ID}/traces/${traceId}`
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

// pickRandom returns a random element of a non-empty array.
function pickRandom<T>(items: ReadonlyArray<T>): T {
  return items[Math.floor(Math.random() * items.length)]
}

// wait resolves after `ms` milliseconds, standing in for real async work.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: PASS. `telemetry.ts` is not imported yet, but it must type-check. If `Sentry.logger` errors, confirm `@sentry/react` is v10 (`node -e "console.log(require('@sentry/react/package.json').version)"`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/telemetry.ts
git commit -m "feat(sentry-react): add telemetry module with faithful signal APIs"
```

---

### Task 2: Todo state + action→telemetry context

**Files:**
- Create: `src/todos-context.tsx`

**Interfaces:**
- Consumes (from Task 1): `breadcrumb`, `openTodoSpan`, `endTodoSpan`, `logAdded`, `logDeleted` from `./telemetry`.
- Produces:
  - `interface Todo { id: string; text: string; done: boolean }`
  - `type Filter = 'all' | 'active' | 'completed'`
  - `function TodosProvider({ children }: { children: ReactNode }): JSX.Element`
  - `function useTodos(): TodosValue` where `TodosValue = { todos: Todo[]; filter: Filter; addTodo(text: string): void; toggleTodo(id: string): void; deleteTodo(id: string): void; clearCompleted(): void; setFilter(f: Filter): void }`

- [ ] **Step 1: Create `src/todos-context.tsx`**

Note: side effects (telemetry, span map mutation) are kept OUT of the `setTodos` updater callbacks, because React StrictMode invokes updaters twice — running telemetry inside them would double-fire. Updaters stay pure; telemetry runs once per handler call.

```tsx
// todos-context.tsx — the in-memory todo list plus the wiring from each action
// to its Sentry signal. State is useState only; there is no backend. Open todos
// hold a span in `spans` until they are completed or deleted.
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Span } from '@sentry/react'
import {
  breadcrumb,
  endTodoSpan,
  logAdded,
  logDeleted,
  openTodoSpan,
} from './telemetry'

// Todo is a single item in the list.
export interface Todo {
  id: string
  text: string
  done: boolean
}

// Filter is which todos the list is showing.
export type Filter = 'all' | 'active' | 'completed'

// TodosValue is the state and actions exposed to the pages.
interface TodosValue {
  todos: Todo[]
  filter: Filter
  addTodo: (text: string) => void
  toggleTodo: (id: string) => void
  deleteTodo: (id: string) => void
  clearCompleted: () => void
  setFilter: (f: Filter) => void
}

const TodosContext = createContext<TodosValue | null>(null)

// TodosProvider holds the list so both routes (`/` and `/todo/:id`) share it,
// and turns each action into the matching Sentry signal.
export function TodosProvider({ children }: { children: ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [filter, setFilterState] = useState<Filter>('all')
  // Open todos' spans, keyed by todo id. Ended on completion or deletion.
  const spans = useRef(new Map<string, Span>()).current

  const addTodo = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) {
        return
      }
      const id = crypto.randomUUID()
      setTodos((prev) => [{ id, text, done: false }, ...prev])
      breadcrumb(`Added todo "${text}"`)
      logAdded(id, text)
      spans.set(id, openTodoSpan(id, text))
    },
    [spans],
  )

  const toggleTodo = useCallback(
    (id: string) => {
      const todo = todos.find((t) => t.id === id)
      if (!todo) {
        return
      }
      const done = !todo.done
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)))
      const span = spans.get(id)
      if (done) {
        // Completing ends the open span, sending its measured duration.
        if (span) {
          endTodoSpan(span)
          spans.delete(id)
        }
      } else if (!span) {
        // Reopening starts a fresh span.
        spans.set(id, openTodoSpan(id, todo.text))
      }
      breadcrumb(`${done ? 'Completed' : 'Reopened'} todo "${todo.text}"`)
    },
    [todos, spans],
  )

  const deleteTodo = useCallback(
    (id: string) => {
      const todo = todos.find((t) => t.id === id)
      setTodos((prev) => prev.filter((t) => t.id !== id))
      const span = spans.get(id)
      if (span) {
        // Deleting an open (not-yet-done) todo cancels its span.
        endTodoSpan(span, { cancelled: todo ? !todo.done : true })
        spans.delete(id)
      }
      if (todo) {
        breadcrumb(`Deleted todo "${todo.text}"`)
        logDeleted(id, todo.text)
      }
    },
    [todos, spans],
  )

  const clearCompleted = useCallback(() => {
    // Completed todos already ended their spans when toggled done.
    setTodos((prev) => prev.filter((t) => !t.done))
    breadcrumb('Cleared completed todos')
  }, [])

  const setFilter = useCallback((f: Filter) => {
    setFilterState(f)
    breadcrumb(`Filtered by "${f}"`)
  }, [])

  const value: TodosValue = {
    todos,
    filter,
    addTodo,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    setFilter,
  }

  return <TodosContext.Provider value={value}>{children}</TodosContext.Provider>
}

// useTodos reads the shared todo state. Throws if used outside the provider.
export function useTodos(): TodosValue {
  const value = useContext(TodosContext)
  if (!value) {
    throw new Error('useTodos must be used within a TodosProvider')
  }
  return value
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: PASS. The provider is unused so far but must type-check.

- [ ] **Step 3: Commit**

```bash
git add src/todos-context.tsx
git commit -m "feat(sentry-react): add todos context wiring actions to telemetry"
```

---

### Task 3: Trace badge + both pages + styles

**Files:**
- Create: `src/components/TraceBadge.tsx`
- Create: `src/pages/TodoList.tsx`
- Create: `src/pages/TodoDetail.tsx`
- Modify: `src/App.css` (add badge/detail styles, remove `.feed*` styles)

**Interfaces:**
- Consumes (Task 1): `currentTraceLink`, `TraceLink`, `captureTestError`, `syncTodos` from `../telemetry`.
- Consumes (Task 2): `useTodos`, `Todo`, `Filter` from `../todos-context`.
- Produces: `function TraceBadge(): JSX.Element`, `function TodoList(): JSX.Element`, `function TodoDetail(): JSX.Element`.

- [ ] **Step 1: Create `src/components/TraceBadge.tsx`**

```tsx
// TraceBadge shows the trace id of the current page and a link to it in Uptrace.
// It reads the active trace on each navigation (keyed on location) and keeps
// showing that id until the next navigation — so you can watch the id change
// ONLY on reload and route change, never on a button click. requestAnimationFrame
// defers the read until after the router integration has opened the new trace.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { currentTraceLink } from '../telemetry'
import type { TraceLink } from '../telemetry'

export function TraceBadge() {
  const location = useLocation()
  const [link, setLink] = useState<TraceLink | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLink(currentTraceLink()))
    return () => cancelAnimationFrame(raf)
  }, [location.key])

  return (
    <div className="trace-badge">
      <span className="trace-badge__label">current trace</span>
      <code className="trace-badge__id">{link?.traceId ?? '—'}</code>
      {link?.url ? (
        <a className="trace-badge__cta" href={link.url} target="_blank" rel="noreferrer">
          View in Uptrace ↗
        </a>
      ) : (
        <span className="trace-badge__label">set VITE_UPTRACE_URL for a link</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/TodoList.tsx`**

```tsx
// TodoList is the main route (`/`): compose, list, filter todos, and the two
// demo buttons. Each todo's text links to its detail route, so clicking it
// triggers a navigation — and a new navigation trace named `/todo/:id`.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTodos } from '../todos-context'
import type { Filter } from '../todos-context'
import { captureTestError, syncTodos } from '../telemetry'
import { TraceBadge } from '../components/TraceBadge'

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
              <Link to={`/todo/${todo.id}`} className={todo.done ? 'todo__text done' : 'todo__text'}>
                {todo.text}
              </Link>
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
          <button className="btn btn-quiet" onClick={() => syncTodos(todos.length)}>
            Sync todos
          </button>
          <button className="btn btn-danger" onClick={captureTestError}>
            Throw test error
          </button>
        </div>
        <p className="hint">
          Adding, completing and deleting todos emit spans and logs on this page's trace. Sync
          runs nested spans; the error button reports an exception. All of them share the current
          trace — it changes only when you reload or open a todo.
        </p>
        <TraceBadge />
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Create `src/pages/TodoDetail.tsx`**

```tsx
// TodoDetail is the `/todo/:id` route. Reaching it is a navigation, so the SDK
// opens a new navigation trace named by the parameterized path `/todo/:id`.
import { Link, useParams } from 'react-router-dom'
import { useTodos } from '../todos-context'
import { TraceBadge } from '../components/TraceBadge'

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
    </main>
  )
}
```

- [ ] **Step 4: Update `src/App.css` — remove feed styles, add badge/detail/text styles**

Delete the entire `.feed` block — every rule from the `.feed {` line through the `.feed__hint:` rule (the block starting at `/* ... */`-commented feed section down to and including `.feed__hint { ... }`). Then append the following at the end of the file:

```css
/* Todo text link -------------------------------------------------------- */

.todo__text {
  flex: 1;
  color: var(--ink);
  text-decoration: none;
}

.todo__text:hover {
  text-decoration: underline;
}

.todo__text.done {
  color: var(--faint);
  text-decoration: line-through;
}

/* Detail page ----------------------------------------------------------- */

.detail__back {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.9rem;
}

.detail__back:hover {
  color: var(--ink);
}

.detail__title {
  margin: 0.5rem 0 0;
  font-size: 1.75rem;
  letter-spacing: -0.02em;
}

.detail__title.done {
  color: var(--faint);
  text-decoration: line-through;
}

/* Current-trace badge --------------------------------------------------- */

.trace-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 0.8rem;
}

.trace-badge__label {
  flex: none;
  color: var(--muted);
}

.trace-badge__id {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.74rem;
  color: var(--ink);
}

.trace-badge__cta {
  flex: none;
  color: var(--accent);
  text-decoration: none;
  font-weight: 560;
  white-space: nowrap;
}

.trace-badge__cta:hover {
  text-decoration: underline;
}
```

Note: the old `.todo label` rules still exist and are now unused (the row no longer wraps a `<label>`); leaving them is harmless, but you may delete the `.todo label`, `.todo label.done span` rules if you want a clean file. The `.todo` fl/gap/border rules are still used.

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: PASS. Pages/badge are not routed yet but must type-check. (App.tsx still exists and still builds.)

- [ ] **Step 6: Commit**

```bash
git add src/components/TraceBadge.tsx src/pages/TodoList.tsx src/pages/TodoDetail.tsx src/App.css
git commit -m "feat(sentry-react): add trace badge, list and detail pages"
```

---

### Task 4: Cutover — router shell, Sentry init, delete old App

**Files:**
- Modify: `src/instrument.ts`
- Modify: `src/main.tsx`
- Delete: `src/App.tsx`

**Interfaces:**
- Consumes (Task 2): `TodosProvider` from `./todos-context`.
- Consumes (Task 3): `TodoList` from `./pages/TodoList`, `TodoDetail` from `./pages/TodoDetail`.

- [ ] **Step 1: Rewrite `src/instrument.ts`**

```ts
// Sentry initialization for the browser.
//
// This file is imported FIRST in main.tsx (before React) so Sentry installs its
// instrumentation before the app renders.
//
// The DSN is read from `VITE_SENTRY_DSN`. Copy `.env.example` to `.env` and
// paste the Sentry DSN from your Uptrace project. See README.md for details.
import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (!dsn) {
  // Make the misconfiguration loud instead of silently dropping every event.
  console.warn(
    'VITE_SENTRY_DSN is not set. Copy .env.example to .env and paste your ' +
      'Uptrace Sentry DSN, then restart `npm run dev`.',
  )
}

Sentry.init({
  dsn,

  // reactRouterV6BrowserTracingIntegration opens a pageload trace on first load
  // and a navigation trace on every route change, each named by the matched
  // route (e.g. /todo/:id). This is the only place traces are started — the app
  // never calls startNewTrace; spans/logs/errors attach to the current trace.
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],

  // Send structured logs (Sentry.logger.*) to Uptrace, used for add/delete.
  enableLogs: true,

  // Sample 100% of traces. Lower this in production; for a demo we want to see
  // every interaction in Uptrace.
  tracesSampleRate: 1.0,

  // Attach a default user/IP so events are easier to find. Turn off if you do
  // not want to send personally identifiable information.
  sendDefaultPii: true,

  // Surfaces as an attribute on every event so you can filter this example's
  // data in Uptrace.
  environment: 'development',
})
```

- [ ] **Step 2: Rewrite `src/main.tsx`**

```tsx
// Import Sentry instrumentation BEFORE anything else so it is initialized
// before React renders.
import './instrument.ts'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { TodosProvider } from './todos-context'
import { TodoList } from './pages/TodoList'
import { TodoDetail } from './pages/TodoDetail'
import './index.css'
import './App.css'

// withSentryReactRouterV6Routing lets the tracing integration name each
// navigation trace by the matched route pattern instead of the raw URL.
const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sentry.ErrorBoundary reports any uncaught render error to Uptrace and
        shows a fallback instead of a blank screen. */}
    <Sentry.ErrorBoundary fallback={<p>Something went wrong — check Uptrace.</p>}>
      <BrowserRouter>
        <TodosProvider>
          <SentryRoutes>
            <Route path="/" element={<TodoList />} />
            <Route path="/todo/:id" element={<TodoDetail />} />
          </SentryRoutes>
        </TodosProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
```

- [ ] **Step 3: Delete the old monolith**

Run: `git rm src/App.tsx`
Expected: `src/App.tsx` removed. All of its logic now lives in `telemetry.ts`, `todos-context.tsx`, and the two pages.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: PASS, clean. If `noUnusedLocals` flags anything in `App.css` — CSS is not type-checked, so this only concerns `.ts/.tsx`. Fix any unused import it reports.

- [ ] **Step 5: Manual verification in the browser**

Run: `npm run dev`, open the printed URL, open devtools (Console + Network), and confirm:
1. **Trace stability:** note the trace id in the badge. Add a todo, complete it, click "Throw test error" — the badge id does NOT change. Network shows envelopes to `/api/<project_id>/envelope/`.
2. **Navigation trace:** click a todo's text → detail page. The badge id CHANGES (new navigation trace). Browser back → changes again.
3. **Lifecycle span:** add a todo, wait a couple seconds, complete it → a `todo.open` span is sent (visible in Network envelopes / in Uptrace) with a non-zero duration.
4. **Sync:** click "Sync todos" a few times → `sync_todos` with `serialize`/`upload` children; some clicks also report an error on the same trace.
5. **Logs:** adding/deleting produces `logger.info` log envelopes (not message events).
6. No console errors, and no `startNewTrace` anywhere (`grep -rn startNewTrace src` returns nothing).

- [ ] **Step 6: Commit**

The `src/App.tsx` deletion was already staged by `git rm` in Step 3, so just stage the two rewritten files and commit all three changes together:

```bash
git add src/instrument.ts src/main.tsx
git commit -m "feat(sentry-react): route the app and remove per-action traces

Swap to reactRouterV6BrowserTracingIntegration with routes / and /todo/:id,
enable the Logs API, and delete the old App.tsx that wrapped every action in
startNewTrace. Traces now come only from pageload and navigation."
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `README.md`**

Rewrite so it matches the new model. Make these concrete edits:

- In the intro bullet list, replace the four bullets with:
  - add / complete / delete todos and watch **spans** and **logs** attach to the current trace,
  - open a todo to **navigate** and see a new navigation trace (`/todo/:id`),
  - press **Sync todos** to run **nested spans**,
  - press **Throw test error** to report an **error** (a few different types) on the current trace.
- Replace the "Each demo button prints its trace id..." paragraph with a description of the **current-trace badge**: it shows the active trace id and (with `VITE_UPTRACE_URL`) links to it, and it changes only on reload or navigation.
- In **How it works**, add a sentence: the app never calls `startNewTrace`; the react-router tracing integration opens a pageload trace on load and a navigation trace on each route change, and every span/log/error attaches to whichever is current.
- Rewrite **section 3 (Generate some data)** to the real actions: add/complete/delete (spans + logs), open a todo (navigation trace), Sync todos (nested spans), Throw test error (exception). Note that two errors on the same page share a trace id, and the id changes when you open a todo.
- Rewrite **section 4 (See it in Uptrace)**: Errors from the button and from failed syncs; Logs from add/delete via the Logs API; Traces containing `todo.open`, `sync_todos` (+ `serialize`/`upload`), and pageload/navigation spans named by route.
- Update the **Project layout** table: `src/instrument.ts` (Sentry init + router integration + logs), `src/telemetry.ts` (all Sentry-usage helpers), `src/todos-context.tsx` (state + action→signal wiring), `src/pages/TodoList.tsx` and `src/pages/TodoDetail.tsx` (routed UI), `src/components/TraceBadge.tsx` (current-trace badge). Remove the `src/App.tsx` row.

- [ ] **Step 2: Update `AGENTS.md`**

- Replace the "No router" clause. Change the sentence "The app is a small todo list: Vite + React + TypeScript, state in `useState` held in memory only. No router, no backend, no UI framework." to keep the state/backend/framework constraints but state that it uses `react-router-dom` for two routes (`/`, `/todo/:id`) so navigation traces exist.
- Update the telemetry bullet to reflect the new mapping: every add/complete/delete leaves a breadcrumb and its signal (span/log); the demo buttons emit nested spans (Sync) and an exception (Throw test error). Note the hard rule: **no `startNewTrace` — traces come only from pageload/navigation.**
- Update the "only Uptrace-specific code" note: `Sentry.init()` in `instrument.ts` is still the only Uptrace-specific wiring; `telemetry.ts` holds Sentry SDK usage.

- [ ] **Step 3: Verify docs match reality**

Run: `grep -rn "startNewTrace\|captureMessage\|reportInSpan\|runTracedTask" src README.md AGENTS.md`
Expected: no matches (all removed from code and prose).

Run: `npm run build`
Expected: PASS (docs-only changes, sanity check).

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs(sentry-react): document the faithful signal model and routes"
```

---

## Notes for the implementer

- **StrictMode double-invocation:** keep all telemetry side effects OUT of `setTodos` updater callbacks (they run twice in dev). Task 2 is already written this way — preserve it.
- **Badge timing:** `currentTraceLink()` must be read after the router integration opens the trace; the `requestAnimationFrame` in `TraceBadge` handles this. If the id shows `—` briefly on first paint that is fine.
- **Idle span lifetime:** a pageload/navigation trace's root span ends a few seconds after it goes idle. The badge captures the id once per navigation and keeps showing it, so later button clicks correctly display the same id even after the root span has ended.
- **RR v7 + Sentry v6 integration:** intentional. RR v7 declarative routing exports the same hooks the `reactRouterV6BrowserTracingIntegration` needs (verified). Do not switch to `reactRouterV7BrowserTracingIntegration` (that is for RR v7 *data* routers / `createBrowserRouter`, which this app does not use).
