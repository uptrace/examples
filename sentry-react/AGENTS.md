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
- The app is a small routed single-page app: Vite + React + TypeScript with
  React Router v7, state held in memory (`useState`). There is no separate
  backend — the `/api/ok|slow|fail` endpoints are Vite dev-server middleware
  (`vite.config.ts`), so they exist under `npm run dev` but not in a static
  `vite preview` build. No UI framework.
- Navigation is traced by `Sentry.withSentryReactRouterV7Routing` (`src/main.tsx`),
  which names each navigation trace by its route pattern (`/products/:id`,
  `/categories/*`), not the concrete URL. Keep that: it is a deliberate
  low-cardinality demonstration, and the concrete URL still rides on the root span
  as `url.full`.
- Each control fires an explicit Sentry signal and leaves a breadcrumb; keep both
  going for new controls. The signals are: Todos (a `created todo` span on add, a
  back-dated `completed todo` span on Done), HTTP (`/api/ok|slow|fail` → an
  `http.client` span; Fail also captures an error), and Errors (one exception per
  button — the home panel uses fixed types, each sub-route its own named errors).
  The not-found route auto-reports a `PageNotFound` error when shown. Document any
  new control in the README.
- Hard rule: never call `Sentry.startNewTrace()` — the trace comes only from the
  browser-tracing integration (a pageload trace on load, a navigation trace on each
  route change). Every signal attaches to the current trace **nested under the
  page's root span** (via `startSpan`/`startInactiveSpan` with `parentSpan` +
  `forceTransaction`, wired in `telemetry.ts`), because Uptrace renders only one
  root span per trace — sibling roots would be dropped from the trace tree.
- TypeScript with `strict` on. JS/TS comments use `//` line comments, including
  comments for exported types and functions.
- Plain CSS only. Design tokens (OKLCH colors, radius, easing) live in `:root` in
  `src/index.css`; component styles in `src/App.css`. No Tailwind, no component
  library, no CSS-in-JS. Keep the dependency list short.

## Commands

- `npm install`
- `npm run dev` — local dev server.
- `npm run build` — type-check (`tsc -b`) and production build.
- `npm test` — Playwright end-to-end tests. They drive the app and assert on what
  it exposes to the page (`window.__signals`, `window.recordedTransactions`), so no
  Sentry credentials are needed. Run `npm run build` and `npm test` when changing
  behavior, and click through the app too.
