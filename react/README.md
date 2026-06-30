# React + Sentry → Uptrace

A minimal React (Vite + TypeScript) todo app instrumented with the
[`@sentry/react`](https://docs.sentry.io/platforms/javascript/guides/react/)
SDK. Uptrace speaks the Sentry ingest protocol, so the Sentry SDK sends data to
Uptrace **without any extra exporter** — you just point the SDK's DSN at your
Uptrace project.

You'll be able to:

- click around a todo list and generate **breadcrumbs**,
- press a button to report an **error** (of a few different types) that shows up in Uptrace,
- press a button to send a **log message** at a chosen level,
- press a button to run a traced task and see the resulting **spans / trace**.

Each demo button prints its trace id to the browser console and, if you set
`VITE_UPTRACE_URL`, shows a link straight to that trace in Uptrace.

## How it works

The Sentry SDK builds its request URLs from the DSN you give it
(`https://<key>@<host>/<project_id>` → `POST <host>/api/<project_id>/envelope/`).
Uptrace exposes exactly those endpoints, where the Sentry "key" is your Uptrace
**project token** and the project id is the final segment of the DSN. So
instrumentation is just a standard `Sentry.init({ dsn })` — see
[`src/instrument.ts`](src/instrument.ts).

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
# from this directory: examples/react
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

- **Add / toggle / delete / filter** a few todos — each action records a
  breadcrumb, so the error you trigger next has a trail leading up to it.
- Click **Run traced task** — runs a span with two child spans.
- Click **Send log message** — sends a log message at a random level
  (info / warning / error).
- Click **Throw test error** — raises an error (caught and reported with
  `captureException`) so its trace is linkable.

Each click runs in its own trace, prints `[uptrace] … sent on trace <id>` to the
console, and shows a **view in Uptrace** link (when `VITE_UPTRACE_URL` is set).
The last two buttons pick from a small pool each click, so repeated clicks
produce a variety of messages and error types in Uptrace. The SDK sends events
over the network as you interact. (Open your browser's devtools Network tab and
look for requests to `/api/<project_id>/envelope/` to confirm they're leaving
the browser.)

## 4. See it in Uptrace

- **Errors** — open your project and look under **Errors** / **Logs**. Each
  click of **Throw test error** sends one of several types (`Error`,
  `TypeError`, `RangeError`, `TodoSyncError`). Open one to see the stack trace
  (which runs through the app's `syncTodos` / `buildSyncPayload` frames) and, in
  the event detail, the **breadcrumbs** (the trail of todo actions that preceded
  it).
- **Messages** — the **Send log message** events also appear under
  **Logs** / **Errors**, tagged with their level.
- **Traces / spans** — open **Traces & Spans** and look for `run_traced_task`
  (with `step_one` / `step_two` children) and `add_todo`. The browser tracing
  integration also produces page-load and navigation spans.

If nothing shows up, double-check that `VITE_SENTRY_DSN` is set (the app logs a
warning in the browser console if it isn't) and that the DSN host matches your
Uptrace ingest address. Restart `npm run dev` after editing `.env`.

## Project layout

| File | Purpose |
| --- | --- |
| `src/instrument.ts` | `Sentry.init()` — the only Uptrace-specific wiring. |
| `src/main.tsx` | Imports instrumentation first; wraps the app in `Sentry.ErrorBoundary`. |
| `src/App.tsx` | The todo UI plus the breadcrumb / error / span demo actions. |
| `.env.example` | Template for the `VITE_SENTRY_DSN` setting. |
