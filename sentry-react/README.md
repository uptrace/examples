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
  reached Uptrace; an **inspector** shows what the last control sent and (when
  `VITE_UPTRACE_URL` is set) links straight to it in Uptrace — to the exact span
  for a custom span (`?span_id=`), or to the trace for other signals.

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
