# React + Sentry example

Rules here apply to `examples/react`, one of the `uptrace/examples` projects:
small, runnable apps that show how to send data to Uptrace. This one shows how
to integrate the Sentry SDK (`@sentry/react`) with a React frontend reporting to
Uptrace, and that is the one thing it teaches. Keep it minimal: an example is
read more than it is run, so every extra feature, file, or dependency is noise
that hides the integration. Add something only when it makes the integration
clearer, not the app richer. The `README.md` is the primary deliverable; when
behavior changes, update it in the same change.

## Core Rules

- The only Uptrace-specific code is `Sentry.init()` in `src/instrument.ts`,
  imported first in `src/main.tsx` (before React) so instrumentation is in place
  before the app renders.
- The DSN comes from `VITE_SENTRY_DSN`; never hardcode a DSN. `.env` is
  gitignored — keep `.env.example` as the template and document it in the README.
- Uptrace ingests the standard Sentry protocol, so there is no Uptrace exporter
  or adapter. If you reach for one, you are doing it wrong.
- The app is a small todo list: Vite + React + TypeScript, state in `useState`
  held in memory only. No router, no backend, no UI framework.
- Every user action (add / toggle / delete / filter) leaves a Sentry breadcrumb
  so a reported event carries the trail that led to it; keep that going for new
  actions. The "Send data to Uptrace" buttons exist only to emit telemetry (a
  span, a log message, an error). Document any new button in the README.
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
