# sentry-react — faithful Sentry signal model refactor

Date: 2026-07-09
Scope: `examples/sentry-react`
Status: approved design, pending spec review

## Problem

The example was built to demonstrate Sentry functionality against Uptrace, but
it models Sentry's behavior incorrectly. The single biggest defect: every user
action wraps itself in `Sentry.startNewTrace()` (via `reportInSpan`), so every
click, add, and delete mints its own artificial trace. The real browser SDK
never does this. The Sentry reference apps
(`react-send-to-sentry`, `nextjs-app-dir`, `sentry-javascript-examples`) all
state the same principle:

> New trace ID only on page reload (pageload trace) or navigation (route
> change). `captureException` / spans / logs do NOT start a trace — they attach
> to the current route's trace, so multiple signals on one page share one
> `trace_id`.

Secondary problems:

- **No router.** Bare `browserTracingIntegration()`, so navigation traces and
  parameterized routes are never demonstrated.
- **Logs use the wrong API.** Add/delete go out via `Sentry.captureMessage`,
  which produces message *events*. The real Sentry Logs product is
  `enableLogs: true` + `Sentry.logger.*`.
- **Artificial machinery.** `reportInSpan`, a fabricated `syncTodos` sequence
  that emits info→warning→error on one synthetic trace, a per-action trace-link
  feed, `runTracedTask`. All of it buries the integration it exists to teach.

## Goal

Rewrite the app so that each todo action maps to the *correct* Sentry signal,
using the real APIs, with trace boundaries that match the browser SDK — while
keeping the one genuinely Uptrace-specific feature (trace links) as a live
demonstration of the trace model.

## Design

### 1. Trace model (the core fix)

- Remove `reportInSpan`, `startNewTrace`, `traceUrl`-per-action, `projectIdFromDsn`
  as an action helper, `runTracedTask`, `syncTodos`/`buildSyncPayload`, and all
  `captureMessage` calls.
- No app code ever starts a trace. New traces come only from the browser-tracing
  integration on pageload and navigation.
- Errors, spans, and logs attach to the current route's trace. Firing the error
  button twice on the same page yields the same `trace_id`.

### 2. Routing

Add `react-router-dom` v6 with the Sentry integration, exactly as the reference:

- `reactRouterV6BrowserTracingIntegration({ useEffect, useLocation, useNavigationType, createRoutesFromChildren, matchRoutes })`
- `withSentryReactRouterV6Routing(Routes)`

Routes:

- `/` — todo list: composer, list, demo buttons, current-trace badge.
- `/todo/:id` — todo detail page. Clicking a todo navigates here. Complete /
  delete available from the detail page too. Navigating here produces a
  navigation trace named by the parameterized route `/todo/:id` (not the literal
  id).

### 3. Signal mapping

| Action | Signal | API |
| --- | --- | --- |
| Add todo | open a span (held in state) + a log | `startInactiveSpan({ name: 'todo.open', attributes: { todo_id, todo_text } })`; `Sentry.logger.info('Added todo', { todo_id, todo_text })` |
| Complete todo | end the span (sends it) | `span.end()` — duration = how long the todo stayed open |
| Delete open todo | end the span, tagged cancelled | `span.setAttribute('cancelled', true); span.end()`; `Sentry.logger.info('Deleted todo', {...})` |
| Toggle back to active / change filter | breadcrumb only | `Sentry.addBreadcrumb({ category: 'todo', ... })` |
| Throw test error | error on current trace | `Sentry.captureException(pickRandom(ERRORS)())` |
| Sync todos | nested wrapping spans + error path | `Sentry.startSpan({ name: 'sync_todos' }, async () => { startSpan('serialize', ...); startSpan('upload', ...) })`, may throw → `captureException` |

Notes:

- The **lifecycle span** (add → complete/delete) is the inactive start/stop
  idiom, integrated into real business logic — one meaningful span per todo, no
  hover noise.
- The **sync** button is the wrapping/nested idiom (parent + child spans with
  real awaited durations), and is where the error demo lives naturally.
- Keep the varied `ERRORS` pool (`Error`, `TypeError`, `RangeError`,
  `TodoSyncError`) — richer than the references and worth keeping so Uptrace
  groups distinct issues.
- Span attributes carry the todo id/text so they are queryable in Uptrace.

Open spans are stored in a `Map<todoId, Span>` in component state so the
lifecycle can end them by id. On unmount / clear, any still-open spans are ended
with a `cancelled` attribute so nothing leaks.

### 4. Config (`src/instrument.ts`)

- Swap `browserTracingIntegration()` → `reactRouterV6BrowserTracingIntegration({...})`.
- Add `enableLogs: true`.
- Keep `dsn` from `VITE_SENTRY_DSN`, `tracesSampleRate: 1.0`,
  `environment: 'development'`. Keep the missing-DSN warning.
- `sendDefaultPii` — keep, documented.

### 5. Current-trace badge (replaces the per-action feed)

The old feed showed one row per action with a link, which only made sense under
the (wrong) one-trace-per-action model. Replace it with a single **current-trace
badge**: shows the active `trace_id` and a "view in Uptrace" link, read from the
active span (`Sentry.getActiveSpan()` / root span). It updates only on pageload
and navigation — visibly demonstrating that the trace id is stable across
button clicks and changes only when the route changes. `projectIdFromDsn` +
`traceUrl` are retained solely to build this one link.

### 6. Docs

- `README.md`: rewrite sections 3–4 to describe routes, the lifecycle span, the
  log API, the error button, the sync button, and the current-trace badge.
  Update the "How it works" and project-layout sections.
- `AGENTS.md`: update the "no router" rule and the breadcrumb/telemetry
  description to match the new model.

## Out of scope

- No Playwright / e2e tests (this stays a user-facing example, not an SDK test
  app).
- No Replay integration.
- No backend; state stays in-memory `useState`.

## Verification

- `npm run build` (`tsc -b` + `vite build`) passes clean.
- `npm run dev`, then in the browser confirm via devtools Network
  (`/api/<project_id>/envelope/`) and the trace badge:
  - Trace id changes on reload and on navigating to `/todo/:id`, and only then.
  - Two error-button clicks on one page share a trace id.
  - Completing a todo sends a `todo.open` span with a non-zero duration.
  - Sync sends `sync_todos` with `serialize` / `upload` children.
  - Add/delete appear as logs (not message events) in Uptrace.
