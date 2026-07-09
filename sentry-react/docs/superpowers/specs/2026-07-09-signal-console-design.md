# Signal Console — design

**Date:** 2026-07-09
**Status:** Approved (design), pending implementation plan
**Replaces:** the current todo-app version of `examples/sentry-react`

## Problem

The current `examples/sentry-react` is a todo app. As an *example of Sentry → Uptrace
instrumentation* it fails at its one job — making the SDK's behavior visible:

- The most interesting signals (a custom span with a measured duration, and structured
  logs) fire **silently** as side effects of todo actions. You can only tell anything was
  sent by opening the browser Network tab.
- The custom span is hard-named `todo.open`, not anything the user typed, so it is not
  intuitive or findable in Uptrace.
- A single "Throw test error" button throws a **random** error type per click, so you
  cannot intentionally produce "a `RangeError`" and go look at it.
- The app is single-page and instant: it cannot demonstrate **navigation traces** (trace
  id changing on route change) or **slow transactions**.

By contrast, Sentry's own `nextjs-app-dir` e2e app is discoverable precisely because it is
an explicit debug panel: the button says "Start span" / "Stop span" and the span's name is
what you typed, so you find it in Uptrace in seconds.

## Goal

Replace the todo app with a **Signal Console**: a small React (Vite + TypeScript) app whose
product *is* the telemetry. Every Sentry signal that Uptrace supports has an explicit,
self-describing control, and firing it shows — in the page itself — what was sent and which
trace it attached to. It is **not** a copy of Sentry's debug panel; it has its own identity
organized around the signal types, with an in-page inspector and delivery-status line that
Sentry's e2e apps do not have.

Audience: Uptrace users learning/evaluating how to wire the `@sentry/react` SDK to Uptrace
and confirm each signal type arrives.

## Scope decisions (locked during brainstorming)

- **Framing:** signal playground with its own identity. Todo app deleted.
- **Core signals:** custom named span (Start/Stop, user-typed name), per-type error buttons,
  structured logs (info/warn/error).
- **Extra capabilities:** HTTP request spans (OK / slow / fail), navigation traces
  (multi-route), in-page signal inspector.
- **Session Replay: dropped.** Uptrace's Sentry ingest docs confirm errors, traces/spans,
  and logs, but do **not** confirm replay ingestion (`replayIntegration` appears only in an
  "optional" config snippet). An example must only advertise signals you can actually find
  in Uptrace, so replay is out. Can be revisited if Uptrace confirms support.
- **Layout:** one console page with four labeled panels + a nav bar with parameterized
  routes to demonstrate navigation traces. Global trace badge + delivery status + inspector
  in the layout.

## Signals & controls

Each control records a **breadcrumb** first (so any subsequent error carries the trail),
makes exactly one primary SDK call, and pushes a record to the in-page inspector store.

| Panel | Control | SDK call | Result in Uptrace |
| --- | --- | --- | --- |
| **Spans** | `[name]` input → **Start span** / **Stop span** | `startInactiveSpan({ name })` … `span.end()` | a span named exactly what the user typed; duration = time between clicks |
| **HTTP** | **OK** / **Slow (~5s)** / **Fail (500)** | `fetch('/api/ok' \| '/api/slow' \| '/api/fail')` | `http.client` spans under the current trace; the slow one is visibly long; the fail one returns 500 and the app also `captureException`s the failure |
| **Logs** | **info** / **warn** / **error** | `Sentry.logger.info/warn/error(msg, attrs)` | structured logs with queryable attributes |
| **Errors** | **Error** / **TypeError** / **RangeError** / **SyncError** | `captureException(new X(...))` | one distinct issue per button — intentional and findable |

Notes:
- The custom span uses `startInactiveSpan` (an inactive span whose lifetime is a user's, not
  a function call's), held in component/context state and ended on **Stop span**. Its name is
  the user's input verbatim.
- **Fail (500)**: the app treats a non-OK response as a failure and calls
  `captureException`, so this one button demonstrates both an `http.client` 500 span and an
  error event, linked on the same trace.
- The app **never** starts a new trace itself (no `startNewTrace`). All signals attach to the
  trace the router-tracing integration opened for the current pageload/navigation.

## Routes

- `/` — the console: the four panels above.
- `/item/:id` — a light route reached from nav links ("Item 42", "Item foo/bar/baz"). Shows
  the parameterized route name and carries **two representative controls** ("Emit log here",
  "Throw error here") so the user can watch a signal attach to the *navigation* trace, not
  just watch the trace id change.

Navigation between routes mints a **new navigation trace**, named by the parameterized route
(`/item/:id`) — which requires switching the SDK integration (below).

## Architecture

Keeps the good infrastructure from the current app: `delivery.ts` (transport wrapper that
observes delivery outcomes), `TraceBadge`, `DeliveryStatus`, DSN-from-env, `sendDefaultPii`,
`environment`.

```
src/
  instrument.ts        Sentry.init — swap browserTracingIntegration ->
                       reactRouterV6BrowserTracingIntegration; keep enableLogs,
                       transport (delivery observer), sendDefaultPii, environment
  telemetry.ts         all SDK calls: startNamedSpan/endNamedSpan, log(level,msg,attrs),
                       the 4 error factories (each exposed individually), breadcrumb,
                       currentTraceLink; each pushes to signals store
  signals.ts    (NEW)  tiny pub/sub "last signal sent" store (framework-free; React
                       subscribes via useSyncExternalStore)
  delivery.ts          unchanged
  main.tsx             BrowserRouter + Sentry-wrapped Routes + ErrorBoundary; drop
                       TodosProvider
  pages/
    Console.tsx (NEW)  the four panels
    ItemRoute.tsx (NEW) /item/:id light page
  components/
    Layout.tsx  (NEW)  nav bar + trace badge + delivery status + inspector, <Outlet/>
    NavBar.tsx  (NEW)
    Inspector.tsx (NEW) renders the last-signal record from signals.ts
    SpanPanel.tsx / HttpPanel.tsx / LogPanel.tsx / ErrorPanel.tsx (NEW)
    TraceBadge.tsx  DeliveryStatus.tsx   (kept)
  vite.config.ts       (NEW plugin) dev-server middleware serving /api/ok|slow|fail
  DELETE: todos-context.tsx, pages/TodoList.tsx
```

### Data flow

```
control click
  -> telemetry.ts  (breadcrumb + one SDK call)
       -> signals.ts.push({ kind, name/message, level?, durationMs?, errorType?, traceId })
            -> Inspector re-renders: "last -> span 'checkout' 420ms on trace a1b2..."
  (in parallel) delivery.ts reports whether the envelope reached Uptrace -> DeliveryStatus
```

So the user sees **both** "what I sent" (Inspector) and "did it arrive" (DeliveryStatus)
without ever opening devtools — the core discoverability fix.

### SDK integration change

`browserTracingIntegration` → `reactRouterV6BrowserTracingIntegration`, wired with
`useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren`, `matchRoutes`
(the standard React Router v6 wiring, as in `react-send-to-sentry`), and `Routes` wrapped
with `Sentry.withSentryReactRouterV6Routing`. This is what parameterizes navigation traces
to `/item/:id` instead of `/item/42`. `react-router-dom` v6 is a new dependency.

### The `/api/*` request target

A small Vite plugin (`configureServer`) serves three routes so `fetch` produces real
`http.client` spans with **no separate backend process** — it lives inside `npm run dev`:

- `/api/ok` — 200, fast.
- `/api/slow` — 200 after ~5s (the "long response" / slow-transaction demo).
- `/api/fail` — 500.

README caveat: these exist under `npm run dev`. A static `vite preview` build will not have
them unless we also add `configurePreviewServer` (optional; include only if we decide preview
must work).

## Error handling

- `main.tsx` wraps the app in `Sentry.ErrorBoundary` with a fallback (kept from current app),
  so an uncaught render error is reported and shows a fallback instead of a blank screen.
- Missing `VITE_SENTRY_DSN` logs a loud console warning (kept).
- `delivery.ts` distinguishes "can't reach Uptrace" (host unreachable) from "Uptrace
  rejected the data" (bad key/project) in the DeliveryStatus line (kept).

## Testing

Playwright, following the `react-send-to-sentry` pattern but asserting **app-observable
state** (the inspector store exposed on `window`, plus `window` hooks for recorded
transactions) rather than polling the live Uptrace API — so tests run with no credentials:

- custom span: Start then Stop → inspector records a span with the typed name and a duration.
- each error button → a captured exception of the expected type.
- each log button → a log record at the expected level.
- `/api/slow` → an `http.client` span with a long duration.
- navigation `/` → `/item/42` → a new navigation trace id (recorded transaction), distinct
  from the pageload trace.

Optionally retain a credentialed live-Uptrace test variant behind env vars, matching the
existing e2e style, but the default suite is credential-free.

## Out of scope / YAGNI

- Session Replay (dropped, see above).
- A persistent backend or database (the app is stateless; `/api/*` is dev middleware only).
- Server-side rendering / Next.js (this is the `@sentry/react` browser SDK example).
- Unrelated refactors beyond deleting the todo files and generalizing `telemetry.ts`.
```
