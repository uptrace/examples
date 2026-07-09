# React + Sentry → Uptrace

A minimal React (Vite + TypeScript) todo app instrumented with the
[`@sentry/react`](https://docs.sentry.io/platforms/javascript/guides/react/)
SDK. Uptrace speaks the Sentry ingest protocol, so the Sentry SDK sends data to
Uptrace **without any extra exporter** — you just point the SDK's DSN at your
Uptrace project.

You'll be able to:

- add / complete / delete todos and watch **spans** and **logs** attach to the
  current trace,
- open a todo to **navigate** and see a new navigation trace (`/todo/:id`),
- press **Sync todos** to run **nested spans**,
- press **Throw test error** to report an **error** (a few different types) on
  the current trace,
- watch a live **delivery-status** line show whether the most recent envelope
  reached Uptrace, so you can tell a working setup from a broken one.

A **current-trace badge** on every page shows the active trace id and, if you
set `VITE_UPTRACE_URL`, a link straight to that trace in Uptrace. It changes
only when you reload or navigate — not on every button click.

## How it works

The Sentry SDK builds its request URLs from the DSN you give it
(`https://<key>@<host>/<project_id>` → `POST <host>/api/<project_id>/envelope/`).
Uptrace exposes exactly those endpoints, where the Sentry "key" is your Uptrace
**project token** and the project id is the final segment of the DSN. So
instrumentation is just a standard `Sentry.init({ dsn })` — see
[`src/instrument.ts`](src/instrument.ts).

The app never manually begins a new trace: the react-router tracing integration
opens a pageload trace on load and a navigation trace on each route change, and every
span, log, and error attaches to whichever trace is current.

## Prerequisites

- [Node.js](https://nodejs.org) 18 or newer (includes `npm`).
- A running Uptrace and a project to send data to:
  - **Self-hosted:** follow the [Uptrace get-started guide](https://uptrace.dev/get-started).
    The Sentry ingest host is usually `localhost:14318`.
  - **Uptrace Cloud:** create a project at <https://app.uptrace.dev>.

## 1. Get your Uptrace Sentry DSN

1. Open your project in Uptrace.
2. In the left sidebar, open the **Project** section and click **Data Source
   Name** (the page at `/projects/<project_id>/dsn`).
3. Switch to the **Sentry** tab and use the copy button next to the DSN.

It looks like:

```
http://project2_secret_token@localhost:14318/2
```

(`project2_secret_token` is your project token, `2` is the project id.)

## 2. Configure and run

```bash
# from this directory: examples/sentry-react
cp .env.example .env
# then edit .env and paste your DSN into VITE_SENTRY_DSN
# optionally set VITE_UPTRACE_URL to your Uptrace UI (e.g. http://localhost:5000)
# to get clickable trace links

npm install
npm run dev
```

Open the URL Vite prints (default <http://localhost:5173>).

## 3. Generate some data

In the app:

- **Add**, **complete**, **delete**, reopen, and **filter** todos. Every one of
  these actions records a breadcrumb — the trail leading up to any error you
  trigger next. Adding opens an inactive `todo.open` span held until the todo is
  completed or deleted (its duration measures how long the todo stayed open),
  plus a structured info **log** (via the Sentry Logs API) carrying the todo's
  text and id. Completing ends the span; deleting a todo sends a delete log and
  ends its span, tagged `cancelled` if the todo was still open.
- Click a todo's **text** to open it — this **navigates** to `/todo/:id`,
  which starts a new navigation trace. Watch the trace badge's id change.
- Click **Sync todos** — runs a `sync_todos` span wrapping nested `serialize`
  and `upload` child spans with real durations; the upload fails about half the
  time, reporting a `captureException` on the same trace.
- Click **Throw test error** — reports a random error (one of `Error`,
  `TypeError`, `RangeError`, `TodoSyncError`) with `captureException` on the
  current trace.

Two errors triggered on the same page share a trace id — the id only changes
when you reload or open a todo. The SDK sends events over the network as you
interact. (Open your browser's devtools Network tab and look for requests to
`/api/<project_id>/envelope/` to confirm they're leaving the browser.)

## 4. See it in Uptrace

- **Errors** — open your project and look under **Errors**. You'll see
  exceptions from **Throw test error** and from failed **Sync todos** uploads
  (one of `Error`, `TypeError`, `RangeError`, `TodoSyncError`). Open one to see
  the stack trace and, in the event detail, the **breadcrumbs** (the trail of
  todo actions that preceded it).
- **Logs** — the info logs from **adding** and **deleting** todos, sent via the
  Logs API, carry the todo's text and id as attributes.
- **Traces / spans** — open **Traces & Spans**. Look for `todo.open` spans (one
  per open todo, duration = time open), `sync_todos` with its `serialize` /
  `upload` children, and the pageload / navigation spans the browser tracing
  integration names by route (`/` and `/todo/:id`).

If nothing shows up, double-check that `VITE_SENTRY_DSN` is set (the app logs a
warning in the browser console if it isn't) and that the DSN host matches your
Uptrace ingest address. Restart `npm run dev` after editing `.env`. Watch the
delivery-status line: "Can't reach Uptrace" means the DSN host is unreachable
(is Uptrace running? is the host right?), while "Uptrace rejected the data"
means the host answered but the DSN key/project is wrong.

## Project layout

| File | Purpose |
| --- | --- |
| `src/instrument.ts` | `Sentry.init()` — the only Uptrace-specific wiring — plus the react-router browser-tracing integration and `enableLogs`. |
| `src/main.tsx` | Imports instrumentation first; wraps the app in `Sentry.ErrorBoundary`. |
| `src/telemetry.ts` | Every Sentry SDK call the app makes: breadcrumbs, the `todo.open` span, logs, `captureException`, and `syncTodos`'s nested spans. |
| `src/todos-context.tsx` | The in-memory todo state and the wiring from each action to its Sentry signal. |
| `src/pages/TodoList.tsx` | The `/` route: compose, list, filter todos, and the demo buttons. |
| `src/pages/TodoDetail.tsx` | The `/todo/:id` route, reached by navigating to a todo. |
| `src/components/TraceBadge.tsx` | Shows the current trace id and, when `VITE_UPTRACE_URL` is set, a link to it. |
| `src/delivery.ts` | Wraps the fetch transport to observe delivery outcomes and publishes the delivery status. |
| `src/components/DeliveryStatus.tsx` | The delivery-status line, shown beside the trace badge. |
| `.env.example` | Template for the `VITE_SENTRY_DSN` setting. |
