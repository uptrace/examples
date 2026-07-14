# React + Sentry → Uptrace

A minimal React (Vite + TypeScript) app instrumented with the
[`@sentry/react`](https://docs.sentry.io/platforms/javascript/guides/react/)
SDK. Uptrace speaks the Sentry ingest protocol, so the SDK sends data to Uptrace
**without any extra exporter** — you point the SDK's DSN at your Uptrace project.

Every control fires one explicit Sentry signal and shows what it sent in an
in-page inspector, so you can watch each signal type and then find it in Uptrace.

- **Todos** — add a todo (a `created todo` span) and mark it **Done** (a
  `completed todo` span whose duration is how long the todo was open).
- **HTTP** — **OK / Slow (~5s) / Fail (500)** fetch a dev endpoint, producing an
  `http.client` span on the current trace (Fail also captures an error).
- **Errors** — one button per type (`Error`, `TypeError`, `RangeError`,
  `SyncError`); each is a distinct, findable issue.
- **Routes** — a side nav lists the app's routes (Products, Categories, News,
  Settings, Redirect, Not found); each navigation mints a new trace named by its
  pattern (`/products/:id`, `/categories/*`), and unmatched paths render NotFound.
- A **trace badge** shows the current trace id (and a link to it if you set
  `VITE_UPTRACE_URL`); a bottom **inspector** shows what the last control sent,
  whether it reached Uptrace (its **delivery status**), and (when
  `VITE_UPTRACE_URL` is set) links straight to it in Uptrace — to the exact span
  for a custom span (`/traces/<traceId>/<spanId>`), or to the trace for other
  signals.

The side nav lists the app's routes (`/products/:id`, `/categories/*`, `/news`,
`/settings`, a redirect, and a not-found catch-all). Each navigation mints a
**new trace** named by its route pattern, so Uptrace groups navigations by route
rather than by concrete URL.

> Session Replay is intentionally not included: Uptrace's Sentry ingest does not
> confirm replay support, and this example only demonstrates signals you can find
> in Uptrace (errors, spans).

## How it works

The Sentry SDK builds its request URLs from the DSN
(`http://<token>@<host>/<project_id>` → `POST <host>/api/<project_id>/envelope/`),
which is exactly what Uptrace exposes. So instrumentation is a standard
`Sentry.init({ dsn })` — see [`src/instrument.ts`](src/instrument.ts). The app
never starts a trace itself: the React Router tracing integration opens a
pageload trace on load and a navigation trace on each route change, and every
span, request, and error attaches to the current trace.

The **HTTP** panel calls `/api/ok`, `/api/slow`, and `/api/fail`, served by a
small Vite dev-server middleware (see [`vite.config.ts`](vite.config.ts)) so
there is **no separate backend**. These endpoints exist under `npm run dev`; a
static `vite preview` build does not include them.

### One trace, one tree

Every signal on a page (custom spans, errors, HTTP) is nested under that
page's pageload/navigation root span, so opening the trace in Uptrace shows one
tree with everything in it. Uptrace stores one root span per trace, so signals are
attached as children rather than as separate roots. Each interaction is therefore
sent as its own Sentry transaction — you will see multiple transaction envelopes
for one page in the Network tab; in Uptrace they appear as one nested tree.

## Prerequisites

- [Node.js](https://nodejs.org) 20 or newer.
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
- **Traces / spans** — your todo spans (`created todo` / `completed todo`), the `http.client` spans (the slow
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
needed: `playwright.config.ts` gives the test dev server a dummy DSN (the SDK is
inert without one) and ignores your `.env`. Nothing listens at that DSN — tests
that read envelopes intercept them in the browser.

## Project layout

| File | Purpose |
| --- | --- |
| `src/instrument.ts` | `Sentry.init()` — the only Uptrace-specific wiring — plus React Router tracing. |
| `src/main.tsx` | Imports instrumentation first; sets up the router and `Sentry.ErrorBoundary`. |
| `src/telemetry.ts` | Every Sentry SDK call: breadcrumbs, custom spans, errors, requests, trace helpers. |
| `src/signals.ts` | Framework-free "last signal sent" store the inspector renders and tests read. |
| `src/pages/Console.tsx` | The home route: the Todos, HTTP, and Errors panels. |
| `src/pages/ProductsPage.tsx`, `CategoriesPage.tsx`, `NotFound.tsx` | The `/products/:id`, `/categories/*`, and catch-all routes. |
| `src/components/RoutePage.tsx` | Shared sub-route body: a subtitle plus per-route error buttons. |
| `src/components/NavBar.tsx` | Side nav that switches routes. |
| `src/components/*Panel.tsx` | One panel per demo: todos, HTTP, errors. |
| `src/components/Inspector.tsx` | Shows what the last control sent and its trace id. |
| `src/components/TraceBadge.tsx` | Current trace id and, with `VITE_UPTRACE_URL`, a link to it. |
| `src/delivery.ts` / `DeliveryStatus.tsx` | Observe and show whether envelopes reach Uptrace. |
| `vite.config.ts` | Dev-server middleware for `/api/ok|slow|fail`. |
