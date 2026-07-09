# Signal Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `examples/sentry-react` todo app with a "Signal Console" whose every control fires one explicit, self-describing Sentry signal (span / http / log / error), shows what it sent in an in-page inspector, and demonstrates navigation traces across two routes.

**Architecture:** A React + Vite + TypeScript SPA. One console route (`/`) holds four signal panels; a second parameterized route (`/item/:id`) proves navigation mints a new trace. All SDK calls live in `telemetry.ts`; each pushes a record to a framework-free `signals.ts` store that the `Inspector` renders and end-to-end tests read off `window.__signals`. HTTP spans hit a Vite dev-server middleware (`/api/ok|slow|fail`) so there is no separate backend. The app never starts a trace itself — every signal attaches to the trace the router-tracing integration opened for the current pageload/navigation.

**Tech Stack:** React 19, `@sentry/react` 10.62, `react-router-dom` 7, Vite 6, TypeScript 5.7 (strict), Playwright for end-to-end tests.

## Global Constraints

- React 19.2, `@sentry/react` ^10.62.0, Vite ^6.0.0, TypeScript strict.
- New deps: `react-router-dom` ^7.18.0 (dependency), `@playwright/test` (devDependency).
- TypeScript config is `verbatimModuleSyntax: true` + `noUnusedLocals`/`noUnusedParameters`: **type-only imports MUST use `import type`**, value imports MUST NOT; no unused imports/locals/params.
- Side-effect import of instrumentation keeps its extension: `import './instrument.ts'`. Named/default module imports omit the extension (match existing code).
- **Never call `Sentry.startNewTrace`.** All signals attach to the current pageload/navigation trace.
- **No Session Replay** — do not add `replayIntegration`.
- Router tracing integration: `Sentry.reactRouterV7BrowserTracingIntegration`; routes wrapper: `Sentry.withSentryReactRouterV7Routing`.
- Read the current trace id via `telemetry.currentTraceId()` (active root span, else `Sentry.getTraceData()['sentry-trace']`).
- Keep unchanged: `src/delivery.ts`, `src/components/DeliveryStatus.tsx`, DSN-from-env, `sendDefaultPii`, `environment: 'development'`, `enableLogs: true`, `tracesSampleRate: 1.0`, the `makeReportingTransport` wiring.
- The slow endpoint delays ~5000ms.
- Commit after every task.

---

### Task 1: Test harness, deps, and window hooks

**Files:**
- Modify: `package.json` (add deps, `test` script)
- Create: `playwright.config.ts`
- Create: `src/globals.d.ts`
- Create: `tests/smoke.spec.ts`

**Interfaces:**
- Produces: `window.__signals?: unknown[]` and `window.recordedTransactions?: string[]` ambient types; a runnable `npx playwright test` harness with `baseURL` `http://localhost:5173` and a `webServer` that runs `npm run dev`.

- [ ] **Step 1: Add dependencies and test script**

Edit `package.json` — add to `"dependencies"`: `"react-router-dom": "^7.18.0"`; add to `"devDependencies"`: `"@playwright/test": "^1.56.0"`; add to `"scripts"`: `"test": "playwright test"`. Then install:

```bash
npm install
npx playwright install chromium
```

- [ ] **Step 2: Create the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

// Drives the running app and asserts on what it exposed to the page
// (window.__signals / window.recordedTransactions), so tests need no Sentry
// credentials. The webServer runs the Vite dev server, which also serves the
// /api/* endpoints the HTTP panel calls.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 3: Declare the window hooks**

Create `src/globals.d.ts`:

```ts
// Ambient window hooks the app uses to expose what it sent, so end-to-end tests
// can assert on it without reading the network. window.__signals mirrors the
// signals store (src/signals.ts); window.recordedTransactions collects pageload
// and navigation transaction event ids (set in src/instrument.ts).
declare global {
  interface Window {
    __signals?: unknown[]
    recordedTransactions?: string[]
  }
}

export {}
```

- [ ] **Step 4: Write the smoke test**

Create `tests/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('app boots and mounts into #root', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#root')).toBeVisible()
})
```

- [ ] **Step 5: Run the smoke test — verify it passes**

Run: `npm test`
Expected: 1 passed. (If it fails to start, the harness/deps are wrong — fix before moving on.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json playwright.config.ts src/globals.d.ts tests/smoke.spec.ts
git commit -m "test(sentry-react): add Playwright harness and window hooks"
```

---

### Task 2: Routing, layout scaffold, and the router-tracing swap

**Files:**
- Modify: `src/instrument.ts` (swap integration; record transactions)
- Modify: `src/telemetry.ts` (reduce to trace helpers + breadcrumb; add `currentTraceId`)
- Modify: `src/components/TraceBadge.tsx` (re-read trace on navigation)
- Modify: `src/main.tsx` (router + routes + ErrorBoundary; drop TodosProvider)
- Create: `src/components/Layout.tsx`
- Create: `src/components/NavBar.tsx`
- Create: `src/pages/Console.tsx`
- Create: `src/pages/ItemRoute.tsx`
- Delete: `src/todos-context.tsx`, `src/pages/TodoList.tsx`
- Create: `tests/routing.spec.ts`

**Interfaces:**
- Consumes: `window.recordedTransactions` (Task 1), `.trace-badge__id` element (existing TraceBadge).
- Produces:
  - `telemetry.breadcrumb(message: string): void`
  - `telemetry.currentTraceId(): string | null`
  - `telemetry.currentTraceLink(): TraceLink | null` where `interface TraceLink { traceId: string; url: string | null }`
  - `Layout`, `NavBar`, `Console`, `ItemRoute` React components.

- [ ] **Step 1: Write the failing navigation test**

Create `tests/routing.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('navigating to /item/:id mints a new trace', async ({ page }) => {
  await page.goto('/')

  const badge = page.locator('.trace-badge__id')
  await expect(badge).not.toHaveText('—')
  const pageloadTrace = (await badge.textContent())!

  await page.getByRole('link', { name: 'Item 42' }).click()
  await expect(page).toHaveURL(/\/item\/42$/)

  // pageload transaction + navigation transaction were both recorded
  await page.waitForFunction(() => (window.recordedTransactions?.length ?? 0) >= 2)

  // the badge now reflects a different (navigation) trace id
  await expect(badge).not.toHaveText(pageloadTrace)
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -- tests/routing.spec.ts`
Expected: FAIL (no "Item 42" link / no route change yet).

- [ ] **Step 3: Swap the integration and record transactions in `instrument.ts`**

Replace `src/instrument.ts` with:

```ts
// Sentry initialization for the browser. Imported FIRST in main.tsx so Sentry
// installs its instrumentation before React renders.
//
// The DSN is read from `VITE_SENTRY_DSN`. Copy `.env.example` to `.env` and
// paste the Sentry DSN from your Uptrace project. See README.md for details.
import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom'
import { makeReportingTransport } from './delivery'

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

  // Wrap the standard fetch transport so the UI can show whether each envelope
  // actually reached the ingest server (see src/delivery.ts). It only observes.
  transport: makeReportingTransport,

  // React Router v7 tracing: opens a pageload trace on load and a navigation
  // trace on each route change, named by the parameterized route (/item/:id).
  // This is the only place traces are started — signals attach to the current
  // trace; the app never calls startNewTrace.
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],

  // Send structured logs (Sentry.logger.*) to Uptrace, used by the Logs panel.
  enableLogs: true,

  // Sample 100% of traces. Lower this in production; for a demo we want to see
  // every interaction in Uptrace.
  tracesSampleRate: 1.0,

  // Attach a default user/IP so events are easier to find. Turn off to avoid PII.
  sendDefaultPii: true,

  // Surfaces as an attribute on every event so you can filter this example's data.
  environment: 'development',
})

// Record pageload/navigation transaction event ids so end-to-end tests can
// assert a new trace was created on navigation.
Sentry.addEventProcessor(event => {
  if (
    event.type === 'transaction' &&
    (event.contexts?.trace?.op === 'pageload' || event.contexts?.trace?.op === 'navigation')
  ) {
    const id = event.event_id
    if (id) {
      window.recordedTransactions = window.recordedTransactions || []
      window.recordedTransactions.push(id)
    }
  }
  return event
})
```

- [ ] **Step 4: Reduce `telemetry.ts` to trace helpers + breadcrumb**

Replace the entire contents of `src/telemetry.ts` with (feature functions are added in later tasks):

```ts
// telemetry.ts — every Sentry SDK call the app makes lives here, isolated from
// the UI. Nothing here starts a new trace: spans, logs and errors all attach to
// the trace the router-tracing integration opened for the current pageload or
// navigation. Each call also records a breadcrumb and (feature calls, added in
// later tasks) push a record to the signals store for the in-page Inspector.
import * as Sentry from '@sentry/react'

// Base URL of the Uptrace UI (e.g. http://localhost:5000), used to build a link
// to the current trace. Optional: without it the badge still shows the trace id.
const UPTRACE_URL = import.meta.env.VITE_UPTRACE_URL

// Project id, taken from the last path segment of the DSN, needed for trace links.
const PROJECT_ID = projectIdFromDsn(import.meta.env.VITE_SENTRY_DSN)

// breadcrumb records an action so it appears in the breadcrumb trail of any
// event later sent on this trace.
export function breadcrumb(message: string): void {
  Sentry.addBreadcrumb({ category: 'signal', message, level: 'info' })
}

// TraceLink is the current trace id plus an optional deep link to it in Uptrace.
export interface TraceLink {
  traceId: string
  url: string | null
}

// currentTraceId returns the trace id the next signal will attach to. It prefers
// the active root span (the idle pageload/navigation transaction); once that has
// ended it falls back to the propagation context carried in the sentry-trace
// header, which still names the current page's trace.
export function currentTraceId(): string | null {
  const active = Sentry.getActiveSpan()
  if (active) {
    return Sentry.getRootSpan(active).spanContext().traceId
  }
  const header = Sentry.getTraceData()['sentry-trace']
  return header ? header.split('-')[0] : null
}

// currentTraceLink is the current trace id plus a link to it in Uptrace.
export function currentTraceLink(): TraceLink | null {
  const traceId = currentTraceId()
  if (!traceId) {
    return null
  }
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
```

- [ ] **Step 5: Make `TraceBadge` re-read on navigation**

In `src/components/TraceBadge.tsx`, add `useLocation` so the badge re-reads the trace id on each route change (the component is mounted once in the persistent layout). Change the import line and the read effect:

Change the react-router import (add near the other imports):

```ts
import { useLocation } from 'react-router-dom'
```

Replace the read effect:

```ts
  const location = useLocation()

  useEffect(() => {
    const raf = requestAnimationFrame(() => setLink(currentTraceLink()))
    return () => cancelAnimationFrame(raf)
  }, [location.key])
```

(Leave the rest of the component unchanged.)

- [ ] **Step 6: Create the layout, nav, and pages**

Create `src/components/NavBar.tsx`:

```tsx
import { NavLink } from 'react-router-dom'

// NavBar links to the console and two item routes. Navigating between them mints
// a new navigation trace, which is the point of having more than one route.
export function NavBar() {
  return (
    <nav className="nav">
      <NavLink to="/" end className="nav__link">
        Home
      </NavLink>
      <NavLink to="/item/42" className="nav__link">
        Item 42
      </NavLink>
      <NavLink to="/item/foo" className="nav__link">
        Item foo
      </NavLink>
    </nav>
  )
}
```

Create `src/components/Layout.tsx` (the `Inspector` is added to it in Task 3):

```tsx
import { Outlet } from 'react-router-dom'
import { NavBar } from './NavBar'
import { TraceBadge } from './TraceBadge'
import { DeliveryStatus } from './DeliveryStatus'

// Layout is the persistent shell around every route: nav, the current-trace
// badge, the delivery-status line, and the routed content.
export function Layout() {
  return (
    <div className="shell">
      <NavBar />
      <div className="statusbar">
        <TraceBadge />
        <DeliveryStatus />
      </div>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
```

Create `src/pages/Console.tsx` (panels are added in Tasks 3–6):

```tsx
// Console is the home route: a header plus the signal panels (added in later
// tasks). Every panel's controls fire a Sentry signal onto the current trace.
export function Console() {
  return (
    <section className="console">
      <header className="console__head">
        <h1>Signal Console</h1>
        <p className="tagline">Each control sends one Sentry signal to Uptrace.</p>
      </header>
      <div className="panels" />
    </section>
  )
}
```

Create `src/pages/ItemRoute.tsx` (controls are added in Task 7):

```tsx
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
```

- [ ] **Step 7: Rewrite `main.tsx` with the router and delete the todo files**

Replace `src/main.tsx` with:

```tsx
// Import Sentry instrumentation BEFORE anything else so it is initialized
// before React renders.
import './instrument.ts'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { Console } from './pages/Console'
import { ItemRoute } from './pages/ItemRoute'
import './index.css'
import './App.css'

// Wrapping Routes lets the router-tracing integration name navigation traces by
// their parameterized path (/item/:id) rather than the concrete URL (/item/42).
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sentry.ErrorBoundary reports any uncaught render error to Uptrace and
        shows a fallback instead of a blank screen. */}
    <Sentry.ErrorBoundary fallback={<p>Something went wrong — check Uptrace.</p>}>
      <BrowserRouter>
        <SentryRoutes>
          <Route element={<Layout />}>
            <Route path="/" element={<Console />} />
            <Route path="/item/:id" element={<ItemRoute />} />
          </Route>
        </SentryRoutes>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
```

Delete the todo files:

```bash
git rm src/todos-context.tsx src/pages/TodoList.tsx
```

- [ ] **Step 8: Typecheck, then run the test — verify it passes**

Run: `npm run build`
Expected: type-check + build succeed (no unused-import or type errors).

Run: `npm test -- tests/routing.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(sentry-react): route the app with React Router v7 tracing"
```

---

### Task 3: Signals store, Inspector, and the Errors panel

**Files:**
- Create: `src/signals.ts`
- Create: `src/components/Inspector.tsx`
- Create: `src/components/ErrorPanel.tsx`
- Modify: `src/telemetry.ts` (add `reportError` + `ErrorType`)
- Modify: `src/components/Layout.tsx` (mount `Inspector`)
- Modify: `src/pages/Console.tsx` (mount `ErrorPanel`)
- Create: `tests/errors.spec.ts`

**Interfaces:**
- Consumes: `telemetry.currentTraceId`, `telemetry.breadcrumb`, `window.__signals`.
- Produces:
  - `signals.ts`: `type SignalKind = 'span' | 'http' | 'log' | 'error'`; `interface SignalRecord { kind: SignalKind; label: string; traceId: string | null; durationMs?: number; level?: 'info' | 'warn' | 'error'; errorType?: string; detail?: string }`; `push(record: SignalRecord): void`; `subscribeSignals(listener: () => void): () => void`; `getSignalSnapshot(): SignalRecord | null`.
  - `telemetry.ts`: `type ErrorType = 'Error' | 'TypeError' | 'RangeError' | 'SyncError'`; `reportError(type: ErrorType): void`.

- [ ] **Step 1: Write the failing errors test**

Create `tests/errors.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('each error button records a typed error signal on the current trace', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'RangeError', exact: true }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'error', errorType: 'RangeError' })
  expect((last as { traceId?: string }).traceId).toBeTruthy()

  await expect(page.locator('.inspector')).toContainText('RangeError')
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -- tests/errors.spec.ts`
Expected: FAIL (no "RangeError" button).

- [ ] **Step 3: Create the signals store**

Create `src/signals.ts`:

```ts
// signals.ts — a tiny framework-free store holding the most recent telemetry
// signal the app produced, so the in-page Inspector can show "what was just
// sent" without the devtools Network tab. Every telemetry.ts feature call pushes
// here. It also mirrors each record onto window.__signals so end-to-end tests
// can read what the app sent.

// SignalKind is which signal type a record describes.
export type SignalKind = 'span' | 'http' | 'log' | 'error'

// SignalRecord is one produced signal, shaped for display and for tests.
export interface SignalRecord {
  kind: SignalKind
  // label is the human summary: the span/log/error name or the request line.
  label: string
  // traceId is the trace the signal attached to when it was produced.
  traceId: string | null
  // durationMs is set for spans and http requests (their measured time).
  durationMs?: number
  // level is set for logs.
  level?: 'info' | 'warn' | 'error'
  // errorType is the error kind for errors (e.g. 'RangeError').
  errorType?: string
  // detail is optional extra context (e.g. an HTTP status).
  detail?: string
}

let snapshot: SignalRecord | null = null
const listeners = new Set<() => void>()

// push records the newest signal, mirrors it to window.__signals (created on
// first use, for tests), and notifies subscribers.
export function push(record: SignalRecord): void {
  snapshot = record
  window.__signals = window.__signals ?? []
  window.__signals.push(record)
  for (const listener of listeners) {
    listener()
  }
}

// subscribeSignals registers a listener and returns an unsubscribe function.
export function subscribeSignals(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// getSignalSnapshot returns the latest record (stable reference between pushes).
export function getSignalSnapshot(): SignalRecord | null {
  return snapshot
}
```

- [ ] **Step 4: Add `reportError` to `telemetry.ts`**

Add to `src/telemetry.ts` — the import of `push` at the top (below the `import * as Sentry` line):

```ts
import { push } from './signals'
```

And append the errors section at the end of the file:

```ts
// ErrorType is the demo error kinds — varied so Uptrace groups them as distinct
// issues instead of one repeated error.
export type ErrorType = 'Error' | 'TypeError' | 'RangeError' | 'SyncError'

// buildError constructs a fresh error of the requested kind so its stack points
// at the app.
function buildError(type: ErrorType): Error {
  switch (type) {
    case 'TypeError':
      return new TypeError("Cannot read properties of undefined (reading 'value')")
    case 'RangeError':
      return new RangeError('Value out of range')
    case 'SyncError':
      return Object.assign(new Error('Failed to sync: network request timed out'), {
        name: 'SyncError',
      })
    case 'Error':
    default:
      return new Error('Example error from the Signal Console')
  }
}

// reportError captures one exception of the given kind on the CURRENT trace.
// captureException does not start a trace, so two errors on one page share a
// trace id.
export function reportError(type: ErrorType): void {
  breadcrumb(`Reporting a ${type}`)
  const err = buildError(type)
  Sentry.captureException(err)
  push({ kind: 'error', label: err.message, errorType: type, traceId: currentTraceId() })
}
```

- [ ] **Step 5: Create the Inspector and Error panel**

Create `src/components/Inspector.tsx`:

```tsx
import { useSyncExternalStore } from 'react'
import { subscribeSignals, getSignalSnapshot } from '../signals'
import type { SignalRecord } from '../signals'

// describe turns a record into the one-line summary the Inspector shows.
function describe(r: SignalRecord): string {
  switch (r.kind) {
    case 'span':
      return `span "${r.label}" — ${r.durationMs}ms`
    case 'http':
      return `${r.label} — ${r.detail} in ${r.durationMs}ms`
    case 'log':
      return `${r.level} log — "${r.label}"`
    case 'error':
      return `${r.errorType} — "${r.label}"`
  }
}

// Inspector shows what the last control sent and which trace it attached to, so
// you never need the devtools Network tab to see a signal reach Uptrace.
export function Inspector() {
  const record = useSyncExternalStore(subscribeSignals, getSignalSnapshot)
  return (
    <aside className="inspector" data-kind={record?.kind ?? 'none'}>
      <span className="inspector__label">last signal</span>
      {record ? (
        <div className="inspector__body">
          <code className="inspector__kind">{record.kind}</code>
          <span className="inspector__text">{describe(record)}</span>
          <span className="inspector__trace">trace {record.traceId ?? '—'}</span>
        </div>
      ) : (
        <span className="inspector__empty">No signal yet. Use a control above.</span>
      )}
    </aside>
  )
}
```

Create `src/components/ErrorPanel.tsx`:

```tsx
import { reportError } from '../telemetry'
import type { ErrorType } from '../telemetry'

const TYPES: ErrorType[] = ['Error', 'TypeError', 'RangeError', 'SyncError']

// ErrorPanel captures one exception per button — each a distinct type so it is
// intentional and findable in Uptrace.
export function ErrorPanel() {
  return (
    <div className="panel">
      <h2>Errors</h2>
      <p>Each button captures one exception on the current trace.</p>
      <div className="panel__actions">
        {TYPES.map(type => (
          <button key={type} className="btn btn-danger" onClick={() => reportError(type)}>
            {type}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Mount the Inspector and Error panel**

In `src/components/Layout.tsx`, add the import and render `Inspector` after `</main>`:

```tsx
import { Inspector } from './Inspector'
```

```tsx
      <main className="content">
        <Outlet />
      </main>
      <Inspector />
```

In `src/pages/Console.tsx`, import `ErrorPanel` and replace `<div className="panels" />` with a populated panels container:

```tsx
import { ErrorPanel } from '../components/ErrorPanel'
```

```tsx
      <div className="panels">
        <ErrorPanel />
      </div>
```

- [ ] **Step 7: Typecheck and run the test — verify it passes**

Run: `npm run build`
Expected: succeeds.

Run: `npm test -- tests/errors.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(sentry-react): signals store, inspector, and Errors panel"
```

---

### Task 4: Spans panel

**Files:**
- Modify: `src/telemetry.ts` (add `startNamedSpan` / `endNamedSpan` + `NamedSpan`)
- Create: `src/components/SpanPanel.tsx`
- Modify: `src/pages/Console.tsx` (mount `SpanPanel`)
- Create: `tests/spans.spec.ts`

**Interfaces:**
- Consumes: `telemetry.breadcrumb`, `telemetry.currentTraceId`, `signals.push`.
- Produces: `telemetry.ts`: `interface NamedSpan { span: Sentry.Span; name: string; startedAt: number }`; `startNamedSpan(name: string): NamedSpan`; `endNamedSpan(handle: NamedSpan): void`.

- [ ] **Step 1: Write the failing spans test**

Create `tests/spans.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('a named span records its typed name and a positive duration', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Span name').fill('checkout')
  await page.getByRole('button', { name: 'Start span' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Stop span' }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'span', label: 'checkout' })
  expect((last as { durationMs?: number }).durationMs).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -- tests/spans.spec.ts`
Expected: FAIL (no "Span name" input).

- [ ] **Step 3: Add span functions to `telemetry.ts`**

Append to `src/telemetry.ts`:

```ts
// NamedSpan is a running custom span plus what we need to report its duration.
export interface NamedSpan {
  span: Sentry.Span
  name: string
  startedAt: number
}

// startNamedSpan starts an inactive span named exactly what the user typed. It
// is inactive (startInactiveSpan) because its lifetime is a user's, not a
// function call's — the caller ends it with endNamedSpan. No startNewTrace: it
// joins the current trace.
export function startNamedSpan(name: string): NamedSpan {
  breadcrumb(`Started span "${name}"`)
  const span = Sentry.startInactiveSpan({ name, op: 'ui.custom' })
  return { span, name, startedAt: performance.now() }
}

// endNamedSpan closes a custom span and records its measured duration.
export function endNamedSpan(handle: NamedSpan): void {
  handle.span.end()
  const durationMs = Math.round(performance.now() - handle.startedAt)
  breadcrumb(`Stopped span "${handle.name}" (${durationMs}ms)`)
  push({ kind: 'span', label: handle.name, durationMs, traceId: currentTraceId() })
}
```

- [ ] **Step 4: Create the Span panel**

Create `src/components/SpanPanel.tsx`:

```tsx
import { useState } from 'react'
import { startNamedSpan, endNamedSpan } from '../telemetry'
import type { NamedSpan } from '../telemetry'

// SpanPanel: type a name, Start the span, Stop it. The span's duration is the
// time between the two clicks, and it shows in Uptrace under the name you typed.
export function SpanPanel() {
  const [name, setName] = useState('')
  const [running, setRunning] = useState<NamedSpan | null>(null)

  return (
    <div className="panel">
      <h2>Spans</h2>
      <p>Name a span, start it, stop it. Its duration is the time between clicks.</p>
      <div className="panel__actions">
        <input
          aria-label="Span name"
          placeholder="span name"
          value={name}
          disabled={running !== null}
          onChange={e => setName(e.target.value)}
        />
        {running ? (
          <button
            className="btn"
            onClick={() => {
              endNamedSpan(running)
              setRunning(null)
              setName('')
            }}
          >
            Stop span
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => setRunning(startNamedSpan(name.trim()))}
          >
            Start span
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Mount the Span panel**

In `src/pages/Console.tsx`, import `SpanPanel` and render it first in `.panels`:

```tsx
import { SpanPanel } from '../components/SpanPanel'
```

```tsx
      <div className="panels">
        <SpanPanel />
        <ErrorPanel />
      </div>
```

- [ ] **Step 6: Typecheck and run the test — verify it passes**

Run: `npm run build`
Expected: succeeds.

Run: `npm test -- tests/spans.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sentry-react): Spans panel with a user-named custom span"
```

---

### Task 5: Logs panel

**Files:**
- Modify: `src/telemetry.ts` (add `emitLog` + `LogLevel`)
- Create: `src/components/LogPanel.tsx`
- Modify: `src/pages/Console.tsx` (mount `LogPanel`)
- Create: `tests/logs.spec.ts`

**Interfaces:**
- Consumes: `telemetry.breadcrumb`, `telemetry.currentTraceId`, `signals.push`.
- Produces: `telemetry.ts`: `type LogLevel = 'info' | 'warn' | 'error'`; `emitLog(level: LogLevel, message: string): void`.

- [ ] **Step 1: Write the failing logs test**

Create `tests/logs.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('a log button records a log signal at the chosen level', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'warn', exact: true }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'log', level: 'warn' })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -- tests/logs.spec.ts`
Expected: FAIL (no "warn" button).

- [ ] **Step 3: Add `emitLog` to `telemetry.ts`**

Append to `src/telemetry.ts`:

```ts
// LogLevel is the structured-log severities the Logs panel emits.
export type LogLevel = 'info' | 'warn' | 'error'

// emitLog sends a real structured log via the Sentry Logs API (enabled with
// enableLogs in instrument.ts). This is NOT captureMessage — logger.* is how
// Sentry models logs. Attributes ride along as queryable fields.
export function emitLog(level: LogLevel, message: string): void {
  breadcrumb(`Log ${level}: ${message}`)
  const attributes = { source: 'signal-console' }
  if (level === 'info') {
    Sentry.logger.info(message, attributes)
  } else if (level === 'warn') {
    Sentry.logger.warn(message, attributes)
  } else {
    Sentry.logger.error(message, attributes)
  }
  push({ kind: 'log', label: message, level, traceId: currentTraceId() })
}
```

- [ ] **Step 4: Create the Log panel**

Create `src/components/LogPanel.tsx`:

```tsx
import { emitLog } from '../telemetry'
import type { LogLevel } from '../telemetry'

const LEVELS: LogLevel[] = ['info', 'warn', 'error']

// LogPanel emits a structured log at each level via the Sentry Logs API.
export function LogPanel() {
  return (
    <div className="panel">
      <h2>Logs</h2>
      <p>Emit a structured log at each level.</p>
      <div className="panel__actions">
        {LEVELS.map(level => (
          <button key={level} className="btn" onClick={() => emitLog(level, `Signal Console ${level} log`)}>
            {level}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Mount the Log panel**

In `src/pages/Console.tsx`, import `LogPanel` and render it in `.panels` (after `SpanPanel`, before `ErrorPanel`):

```tsx
import { LogPanel } from '../components/LogPanel'
```

```tsx
      <div className="panels">
        <SpanPanel />
        <LogPanel />
        <ErrorPanel />
      </div>
```

- [ ] **Step 6: Typecheck and run the test — verify it passes**

Run: `npm run build`
Expected: succeeds.

Run: `npm test -- tests/logs.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sentry-react): Logs panel emitting structured logs"
```

---

### Task 6: HTTP panel + Vite dev-server middleware

**Files:**
- Modify: `src/telemetry.ts` (add `sendRequest` + `RequestKind`)
- Modify: `vite.config.ts` (add `/api/ok|slow|fail` middleware)
- Create: `src/components/HttpPanel.tsx`
- Modify: `src/pages/Console.tsx` (mount `HttpPanel`)
- Create: `tests/http.spec.ts`

**Interfaces:**
- Consumes: `telemetry.breadcrumb`, `telemetry.currentTraceId`, `signals.push`.
- Produces: `telemetry.ts`: `type RequestKind = 'ok' | 'slow' | 'fail'`; `sendRequest(kind: RequestKind): Promise<void>`. Vite dev routes `/api/ok` (200), `/api/slow` (200 after ~5s), `/api/fail` (500).

- [ ] **Step 1: Write the failing http tests**

Create `tests/http.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('OK request records an http signal with status 200', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'OK (200)' }).click()

  const rec = await page.waitForFunction(() =>
    (window.__signals ?? []).find(
      (s): s is { kind: string; label: string; detail: string } =>
        (s as { kind?: string }).kind === 'http' && (s as { label?: string }).label === 'GET /api/ok',
    ),
  )
  expect(await rec.jsonValue()).toMatchObject({ label: 'GET /api/ok', detail: 'HTTP 200' })
})

test('slow request records a long http span', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Slow (~5s)' }).click()

  const rec = await page.waitForFunction(
    () =>
      (window.__signals ?? []).find(
        (s): s is { kind: string; label: string; durationMs: number } =>
          (s as { kind?: string }).kind === 'http' && (s as { label?: string }).label === 'GET /api/slow',
      ),
    null,
    { timeout: 15_000 },
  )
  expect((await rec.jsonValue()).durationMs).toBeGreaterThan(4500)
})

test('failed request also records an error signal', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Fail (500)' }).click()

  const rec = await page.waitForFunction(() =>
    (window.__signals ?? []).find(
      (s): s is { kind: string; label: string } => (s as { kind?: string }).kind === 'error',
    ),
  )
  expect((await rec.jsonValue()).label).toContain('/api/fail')
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -- tests/http.spec.ts`
Expected: FAIL (no "OK (200)" button / no /api routes).

- [ ] **Step 3: Add the dev-server middleware to `vite.config.ts`**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The slow endpoint's delay, long enough to show as a visibly slow span.
const SLOW_MS = 5000

// devApi serves /api/ok|slow|fail from the Vite dev server so the app can make
// real requests (producing http.client spans) with no separate backend. These
// exist only under `npm run dev`, not in a static `vite preview` build.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (url === '/api/ok') {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }
        if (url === '/api/fail') {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'intentional failure' }))
          return
        }
        if (url === '/api/slow') {
          setTimeout(() => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, slow: true }))
          }, SLOW_MS)
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
})
```

- [ ] **Step 4: Add `sendRequest` to `telemetry.ts`**

Append to `src/telemetry.ts`:

```ts
// RequestKind is the three demo endpoints the HTTP panel can call.
export type RequestKind = 'ok' | 'slow' | 'fail'

// sendRequest fetches a dev endpoint, producing an http.client span on the
// current trace (the browser-tracing integration instruments fetch). It records
// its own measured record for the Inspector, and treats a non-OK response as a
// failure worth capturing as an error too.
export async function sendRequest(kind: RequestKind): Promise<void> {
  breadcrumb(`Sending ${kind} request`)
  const startedAt = performance.now()
  try {
    const res = await fetch(`/api/${kind}`)
    const durationMs = Math.round(performance.now() - startedAt)
    push({
      kind: 'http',
      label: `GET /api/${kind}`,
      durationMs,
      detail: `HTTP ${res.status}`,
      traceId: currentTraceId(),
    })
    if (!res.ok) {
      const err = new Error(`Request to /api/${kind} failed: HTTP ${res.status}`)
      Sentry.captureException(err)
      push({ kind: 'error', label: err.message, errorType: 'Error', traceId: currentTraceId() })
    }
  } catch (e) {
    const durationMs = Math.round(performance.now() - startedAt)
    Sentry.captureException(e)
    push({
      kind: 'http',
      label: `GET /api/${kind}`,
      durationMs,
      detail: 'network error',
      traceId: currentTraceId(),
    })
  }
}
```

- [ ] **Step 5: Create the HTTP panel**

Create `src/components/HttpPanel.tsx`:

```tsx
import { useState } from 'react'
import { sendRequest } from '../telemetry'
import type { RequestKind } from '../telemetry'

const REQUESTS: { kind: RequestKind; label: string }[] = [
  { kind: 'ok', label: 'OK (200)' },
  { kind: 'slow', label: 'Slow (~5s)' },
  { kind: 'fail', label: 'Fail (500)' },
]

// HttpPanel fetches a dev endpoint per button, each producing an http.client
// span on the current trace. The Fail button also captures an error.
export function HttpPanel() {
  const [busy, setBusy] = useState<RequestKind | null>(null)

  return (
    <div className="panel">
      <h2>HTTP</h2>
      <p>Fetch a dev endpoint — each produces an http.client span on the current trace.</p>
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
```

- [ ] **Step 6: Mount the HTTP panel**

In `src/pages/Console.tsx`, import `HttpPanel` and render it in `.panels` (after `SpanPanel`, before `LogPanel`):

```tsx
import { HttpPanel } from '../components/HttpPanel'
```

```tsx
      <div className="panels">
        <SpanPanel />
        <HttpPanel />
        <LogPanel />
        <ErrorPanel />
      </div>
```

- [ ] **Step 7: Typecheck and run the test — verify it passes**

Run: `npm run build`
Expected: succeeds.

Run: `npm test -- tests/http.spec.ts`
Expected: 3 passed (the slow test takes ~5s).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(sentry-react): HTTP panel with ok/slow/fail dev endpoints"
```

---

### Task 7: Item-route controls (signals on the navigation trace)

**Files:**
- Modify: `src/pages/ItemRoute.tsx` (add two controls)
- Create: `tests/item-route.spec.ts`

**Interfaces:**
- Consumes: `telemetry.emitLog`, `telemetry.reportError`.

- [ ] **Step 1: Write the failing item-route test**

Create `tests/item-route.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('a signal fired on /item/:id attaches to the navigation trace', async ({ page }) => {
  await page.goto('/')
  const pageloadTrace = (await page.locator('.trace-badge__id').textContent())!

  await page.getByRole('link', { name: 'Item 42' }).click()
  await expect(page).toHaveURL(/\/item\/42$/)
  await page.waitForFunction(() => (window.recordedTransactions?.length ?? 0) >= 2)

  await page.getByRole('button', { name: 'Throw error here' }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect((last as { kind?: string }).kind).toBe('error')
  const traceId = (last as { traceId?: string }).traceId
  expect(traceId).toBeTruthy()
  expect(traceId).not.toBe(pageloadTrace)
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm test -- tests/item-route.spec.ts`
Expected: FAIL (no "Throw error here" button).

- [ ] **Step 3: Add the controls to `ItemRoute`**

Replace `src/pages/ItemRoute.tsx` with:

```tsx
import { useParams } from 'react-router-dom'
import { emitLog, reportError } from '../telemetry'

// ItemRoute is a second route reached from the nav. Navigating here starts a new
// navigation trace named /item/:id; the two controls fire a signal onto THAT
// trace, showing that signals attach to the current route's trace.
export function ItemRoute() {
  const { id } = useParams()
  return (
    <section className="console">
      <header className="console__head">
        <h1>Item {id}</h1>
        <p className="tagline">Navigating here started a new trace. Signals fired here attach to it.</p>
      </header>
      <div className="panel">
        <h2>Fire a signal on this route</h2>
        <div className="panel__actions">
          <button className="btn" onClick={() => emitLog('info', `Viewed item ${id}`)}>
            Emit log here
          </button>
          <button className="btn btn-danger" onClick={() => reportError('Error')}>
            Throw error here
          </button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Typecheck and run the test — verify it passes**

Run: `npm run build`
Expected: succeeds.

Run: `npm test -- tests/item-route.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sentry-react): item-route controls fire signals on the nav trace"
```

---

### Task 8: Styling, README, and full-suite verification

**Files:**
- Modify: `src/App.css` (full rewrite: layout / nav / panels / inspector; keep kept-component classes)
- Modify: `README.md` (rewrite for the Signal Console)
- Modify: `.env.example` (comment tweak only)

**Interfaces:** none (presentation + docs).

- [ ] **Step 1: Rewrite `src/App.css`**

Replace the entire contents of `src/App.css` with the following. It styles the new shell/nav/panels/inspector and keeps the `.trace-badge*`, `.delivery*`, and `.btn*` classes the retained components use; it drops all todo-specific rules.

```css
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --line: #262b36;
  --text: #e6e8ee;
  --muted: #9aa3b2;
  --accent: #6ea8fe;
  --danger: #f0796b;
  --ok: #5ec98a;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}

.shell {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 20px 96px;
}

.nav {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.nav__link {
  padding: 6px 12px;
  border-radius: 8px;
  color: var(--muted);
  text-decoration: none;
  border: 1px solid transparent;
}

.nav__link.active {
  color: var(--text);
  border-color: var(--line);
  background: var(--panel);
}

.statusbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  padding: 12px 14px;
  margin-bottom: 20px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.console__head {
  margin-bottom: 16px;
}

.console__head h1 {
  margin: 0;
  font-size: 22px;
}

.tagline {
  margin: 4px 0 0;
  color: var(--muted);
}

.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px 16px;
}

.panel h2 {
  margin: 0 0 4px;
  font-size: 15px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
}

.panel p {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}

.panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.btn {
  border: 1px solid var(--line);
  background: #1e222b;
  color: var(--text);
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.btn:hover:not(:disabled) {
  border-color: var(--accent);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-danger {
  border-color: var(--danger);
  color: var(--danger);
}

.panel__actions input {
  background: #12151b;
  border: 1px solid var(--line);
  color: var(--text);
  padding: 8px 10px;
  border-radius: 8px;
  font: inherit;
  min-width: 160px;
}

.trace-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.trace-badge__label {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.trace-badge__id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--text);
}

.trace-badge__cta {
  color: var(--accent);
  text-decoration: none;
}

.delivery {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.delivery__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--muted);
}

.delivery[data-state='ok'] .delivery__dot {
  background: var(--ok);
}

.delivery[data-state='failed'] .delivery__dot {
  background: var(--danger);
}

.delivery[data-state='sending'] .delivery__dot {
  background: var(--accent);
}

.inspector {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(820px, calc(100% - 40px));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #12151bee;
  border: 1px solid var(--line);
  border-radius: 12px;
  backdrop-filter: blur(6px);
}

.inspector__label {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.inspector__body {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.inspector__kind {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--accent);
}

.inspector__trace {
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.inspector__empty {
  color: var(--muted);
  font-size: 13px;
}
```

- [ ] **Step 2: Rewrite `README.md`**

Replace `README.md` with:

````markdown
# React + Sentry → Uptrace (Signal Console)

A minimal React (Vite + TypeScript) app instrumented with the
[`@sentry/react`](https://docs.sentry.io/platforms/javascript/guides/react/)
SDK. Uptrace speaks the Sentry ingest protocol, so the SDK sends data to Uptrace
**without any extra exporter** — you point the SDK's DSN at your Uptrace project.

It is a **Signal Console**: every control fires one explicit Sentry signal and
shows what it sent in an in-page inspector, so you can watch each signal type and
then find it in Uptrace.

- **Spans** — type a name, **Start span** / **Stop span**; the span shows in
  Uptrace under the name you typed, its duration = the time between clicks.
- **HTTP** — **OK / Slow (~5s) / Fail (500)** fetch a dev endpoint, producing an
  `http.client` span on the current trace (Fail also captures an error).
- **Logs** — **info / warn / error** emit structured logs via the Sentry Logs API.
- **Errors** — one button per type (`Error`, `TypeError`, `RangeError`,
  `SyncError`); each is a distinct, findable issue.
- A **trace badge** shows the current trace id (and a link to it if you set
  `VITE_UPTRACE_URL`); a **delivery-status** line shows whether the last envelope
  reached Uptrace; an **inspector** shows what the last control sent.

Two routes (**Home** and **Item 42 / Item foo**) demonstrate that navigating
mints a **new trace** — the trace id changes on navigation, not just on reload.

> Session Replay is intentionally not included: Uptrace's Sentry ingest does not
> confirm replay support, and this example only demonstrates signals you can find
> in Uptrace (errors, spans, logs).

## How it works

The Sentry SDK builds its request URLs from the DSN
(`http://<token>@<host>/<project_id>` → `POST <host>/api/<project_id>/envelope/`),
which is exactly what Uptrace exposes. So instrumentation is a standard
`Sentry.init({ dsn })` — see [`src/instrument.ts`](src/instrument.ts). The app
never starts a trace itself: the React Router tracing integration opens a
pageload trace on load and a navigation trace on each route change, and every
span, log, and error attaches to the current trace.

The **HTTP** panel calls `/api/ok`, `/api/slow`, and `/api/fail`, served by a
small Vite dev-server middleware (see [`vite.config.ts`](vite.config.ts)) so
there is **no separate backend**. These endpoints exist under `npm run dev`; a
static `vite preview` build does not include them.

## Prerequisites

- [Node.js](https://nodejs.org) 18 or newer.
- A running Uptrace and a project to send data to:
  - **Self-hosted:** [Uptrace get-started guide](https://uptrace.dev/get-started).
    The Sentry ingest host is usually `localhost:14318`.
  - **Uptrace Cloud:** create a project at <https://app.uptrace.dev>.

## 1. Get your Uptrace Sentry DSN

Open your project in Uptrace → **Project → Data Source Name** → **Sentry** tab →
copy the DSN. It looks like `http://project2_secret_token@localhost:14318/2`.

## 2. Configure and run

```bash
# from this directory: examples/sentry-react
cp .env.example .env
# edit .env: paste your DSN into VITE_SENTRY_DSN
# optionally set VITE_UPTRACE_URL to your Uptrace UI for clickable trace links

npm install
npm run dev
```

Open the URL Vite prints (default <http://localhost:5173>).

## 3. Generate and find data

Use the panels, watching the inspector and delivery-status line. Then in Uptrace:

- **Errors** — the four error buttons (each a distinct type).
- **Logs** — the info/warn/error logs, with `source` attribute.
- **Traces / spans** — your named custom spans, the `http.client` spans (the slow
  one is visibly long), and the pageload/navigation traces. Navigate between
  routes and watch the trace id change.

If nothing shows up, check that `VITE_SENTRY_DSN` is set (the app warns in the
console if not) and that the DSN host matches your Uptrace ingest address.
Restart `npm run dev` after editing `.env`. The delivery-status line distinguishes
"can't reach Uptrace" (host unreachable) from "Uptrace rejected the data" (bad
DSN key/project).

## Tests

```bash
npm test
```

Playwright drives the app and asserts on what it exposed to the page
(`window.__signals`, `window.recordedTransactions`), so no Sentry credentials are
needed.

## Project layout

| File | Purpose |
| --- | --- |
| `src/instrument.ts` | `Sentry.init()` — the only Uptrace-specific wiring — plus React Router tracing and `enableLogs`. |
| `src/main.tsx` | Imports instrumentation first; sets up the router and `Sentry.ErrorBoundary`. |
| `src/telemetry.ts` | Every Sentry SDK call: breadcrumbs, custom spans, logs, errors, requests, trace helpers. |
| `src/signals.ts` | Framework-free "last signal sent" store the inspector renders and tests read. |
| `src/pages/Console.tsx` | The home route: the four signal panels. |
| `src/pages/ItemRoute.tsx` | The `/item/:id` route: fire a signal on the navigation trace. |
| `src/components/*Panel.tsx` | One panel per signal type. |
| `src/components/Inspector.tsx` | Shows what the last control sent and its trace id. |
| `src/components/TraceBadge.tsx` | Current trace id and, with `VITE_UPTRACE_URL`, a link to it. |
| `src/delivery.ts` / `DeliveryStatus.tsx` | Observe and show whether envelopes reach Uptrace. |
| `vite.config.ts` | Dev-server middleware for `/api/ok|slow|fail`. |
````

- [ ] **Step 3: Tidy `.env.example` comment**

In `.env.example`, the `VITE_UPTRACE_URL` comment says "each demo action into a clickable link". Change that sentence to reference the trace badge instead:

Replace:
```
# Optional: base URL of your Uptrace UI (its site URL), used to turn each demo
# action into a clickable link to its trace. Without it the app still logs the
# trace id to the console.
```
with:
```
# Optional: base URL of your Uptrace UI (its site URL), used to turn the current
# trace badge into a clickable link to that trace. Without it the badge still
# shows the trace id.
```

- [ ] **Step 4: Run the full suite and a production build**

Run: `npm test`
Expected: all specs pass (smoke, routing, errors, spans, logs, http ×3, item-route).

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sentry-react): style the Signal Console and rewrite the README"
```

---

## Self-Review

**Spec coverage:**
- Signal playground identity, todo deleted → Tasks 2 (delete) + 3–6 (panels) + 8 (identity/README). ✓
- Custom named span (user's text, duration) → Task 4. ✓
- Per-type error buttons → Task 3. ✓
- Structured logs (info/warn/error) → Task 5. ✓
- HTTP spans ok/slow/fail via Vite dev middleware → Task 6. ✓
- Navigation traces over multiple routes → Task 2 (routing + swap) + Task 7 (signal on nav trace). ✓
- In-page inspector + delivery status visible without devtools → Task 3 (Inspector) + kept DeliveryStatus. ✓
- Session Replay dropped → not added anywhere; README states it explicitly. ✓
- `reactRouterV7BrowserTracingIntegration` + `withSentryReactRouterV7Routing` + `getTraceData` fallback → Task 2. ✓
- Testing via Playwright on app-observable state → Tasks 1–8 specs. ✓
- Error handling: ErrorBoundary + DSN warning + delivery states → Task 2 (main.tsx, instrument.ts) + kept files. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test shows real assertions. The one deferred item from the spec (`configurePreviewServer`) is intentionally out of scope and called out in the README as a dev-only limitation, not left as a placeholder.

**Type consistency:** `SignalRecord` fields (`kind`, `label`, `traceId`, `durationMs`, `level`, `errorType`, `detail`) are used consistently by `push` callers in Tasks 3–7 and by `Inspector.describe` in Task 3. `ErrorType`, `LogLevel`, `RequestKind`, `NamedSpan`, `TraceLink` are each defined once in `telemetry.ts` and imported with `import type` where consumed. `currentTraceId` is defined in Task 2 and used by all later telemetry functions. Panel mount order in `Console.tsx` (`SpanPanel`, `HttpPanel`, `LogPanel`, `ErrorPanel`) is consistent across the incremental edits in Tasks 3–6.
