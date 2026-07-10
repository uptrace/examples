# React + Sentry example

Rules here apply to `examples/sentry-react`, one of the `uptrace/examples` projects:
small, runnable apps that show how to send data to Uptrace. This one shows how
to integrate the Sentry SDK (`@sentry/react`) with a React frontend reporting to
Uptrace, and that is the one thing it teaches. Keep it minimal: an example is
read more than it is run, so every extra feature, file, or dependency is noise
that hides the integration. Add something only when it makes the integration
clearer, not the app richer. The `README.md` is the primary deliverable; when
behavior changes, update it in the same change.

## Core Rules

- The only Uptrace-specific code is `Sentry.init()` in `src/instrument.ts`;
  `src/telemetry.ts` holds the rest of the Sentry SDK usage. `instrument.ts` is
  imported first in `src/main.tsx` (before React) so instrumentation is in place
  before the app renders. `instrument.ts` also installs a reporting transport
  wrapper (`src/delivery.ts`) that observes send outcomes for the UI — it wraps
  the standard fetch transport and does not change delivery, so it is not an
  Uptrace-specific adapter.
- The DSN comes from `VITE_SENTRY_DSN`; never hardcode a DSN. `.env` is
  gitignored — keep `.env.example` as the template and document it in the README.
- Uptrace ingests the standard Sentry protocol, so there is no Uptrace exporter
  or adapter. If you reach for one, you are doing it wrong.
- The app is a small single-page todo list: Vite + React + TypeScript, state in
  `useState` held in memory only. No router, no backend, no UI framework.
- Every user action (add / complete / delete / reopen / filter) leaves a Sentry
  breadcrumb; keep that going for new actions. Some also carry a signal: add
  opens a `todo.open` span and emits a log, complete ends the span, delete ends
  the span (tagged `cancelled` if still open) and emits a log. The **Throw test
  error** button on `TodoList` reports an exception on the current trace.
  Document any new button in the README. Hard rule: never call
  `Sentry.startNewTrace()` — the trace comes only from the pageload
  browser-tracing integration in `instrument.ts`. Every signal attaches
  to that trace **nested under the page's root span** (via `startSpan`/
  `startInactiveSpan` with `parentSpan` + `forceTransaction`, wired in
  `telemetry.ts`), because Uptrace renders only one root span per trace — sibling
  roots would be dropped from the trace tree.
- TypeScript with `strict` on. JS/TS comments use `//` line comments, including
  comments for exported types and functions.
- Plain CSS only. Design tokens (OKLCH colors, radius, easing) live in `:root` in
  `src/index.css`; component styles in `src/App.css`. No Tailwind, no component
  library, no CSS-in-JS. Keep the dependency list short.

## Commands

- `npm install`
- `npm run dev` — local dev server.
- `npm run build` — type-check (`tsc -b`) and production build. This is the
  verification step; there are no unit tests (it is an example). Also run the app
  and click through it when changing behavior.
