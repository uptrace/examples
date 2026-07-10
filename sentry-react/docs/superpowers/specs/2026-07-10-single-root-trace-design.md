# Single-root trace for Uptrace — design

**Date:** 2026-07-10
**Status:** Approved (design), pending implementation plan
**Affects:** `examples/sentry-react` only. No Uptrace backend/frontend changes.

## Problem

The Signal Console attaches every signal to the current pageload/navigation trace and
never calls `startNewTrace` (a deliberate rule in `AGENTS.md`). The intent is "one trace
per page holds everything the user did," so a reviewer can see the whole picture in one
trace view — the way Sentry shows a browser session.

But the signals produced *after* the pageload finishes do not render in Uptrace's trace
tree. Concretely:

- The browser-tracing integration opens a `pageload — /` root span and, while it is
  active, nests the `browser.*` resource spans under it. After a short idle timeout that
  transaction **ends** and is sent.
- Later user actions (throw an error, start a custom span, an HTTP request, a log) run when
  there is **no active span**. Sentry keeps the same trace id (from the propagation
  context), but with no active parent each of these becomes a **new root span** in that
  same trace — Sentry's `BROWSER_MULTIPLE_ROOTS` shape.

Uptrace's trace model is **single-root by design** (one `parent_id == 0` span per trace is
a load-bearing invariant across its assembly, truncation, re-rooting, and counting logic —
not a bug to be fixed). Its trace assembler keeps the first root and drops the rest. So the
later interaction roots are **stored and counted but never shown in the tree** — they only
appear in a span card, not when you open the trace. That is the bug the reviewer sees.

## Goal

Make each page's trace a **single tree**: the `pageload`/`navigation` span is the one root,
and every user interaction on that page (custom spans, HTTP, errors, logs) is **nested
underneath it** rather than becoming a sibling root. Result in Uptrace: open the trace, see
one root with the `browser.*` spans and all interactions as children — the "one picture of
what happened" the reviewer wants — with **zero Uptrace changes** and the single-root
invariant untouched.

## Non-goals

- Not changing Uptrace (`tracing/`). The single-root model stays.
- Not calling `startNewTrace` — the `AGENTS.md` rule stands. We change *how* signals attach
  (as children of the page root), not *which* trace they attach to.
- Not fabricating a synthetic super-root above `pageload` (the rejected "option 1"). We
  reuse the root the integration already creates.

## Approach (locked during brainstorming)

Reuse the existing pageload/navigation root as the single parent, and start every
interaction as a **child transaction** of it. Two mechanisms, both verified against the
`@sentry/react` v10 core source:

1. **Track the current page root.** Subscribe once to the client's `spanStart` hook and
   remember the pageload/navigation root span:

   ```ts
   let pageRoot: Sentry.Span | undefined
   Sentry.getClient()?.on('spanStart', (span) => {
     const { parent_span_id, op } = Sentry.spanToJSON(span)
     if (!parent_span_id && (op === 'pageload' || op === 'navigation')) {
       pageRoot = span
     }
   })
   ```

   `spanStart` fires with the root span (`core/src/tracing/trace.ts:552`), and re-fires on
   every navigation, so `pageRoot` always points at the current page's root. Holding the
   reference is safe after the transaction ends — we only read its `spanContext()`.

2. **Nest every feature call under it** using `parentSpan` + `forceTransaction`:

   ```ts
   Sentry.startSpan({ name, op, parentSpan: pageRoot, forceTransaction: true }, (span) => { … })
   ```

   Per `core/src/tracing/trace.ts:419-434`, when a `parentSpan` is given and
   `forceTransaction` is set, the SDK starts a **root-level transaction** (its own envelope,
   so it is actually sent) that carries the parent's `traceId` and `parentSpanId`. On the
   wire the interaction therefore arrives with `parent_id = pageRoot.spanId` on the pageload
   trace, and Uptrace's assembler attaches it as a child of the root. This holds even though
   `pageRoot` has already ended, because only its `spanContext()` (trace id + span id) is
   read.

### Per-function changes in `src/telemetry.ts`

All feature calls run their Sentry work parented to `pageRoot`. When `pageRoot` is
`undefined` (e.g. before the first pageload span starts), `parentSpan: undefined` falls back
to today's behavior — a safe no-op degrade.

- **`reportError(type)`** — wrap the capture so the error attaches to a child span:
  `startSpan({ name: 'error: '+type, op: 'ui.error', parentSpan: pageRoot, forceTransaction: true }, () => Sentry.captureException(err))`.
  The error log's `parent_id` becomes that child span → nested under the page root.
- **`startNamedSpan(name)` / `endNamedSpan`** — pass `parentSpan: pageRoot, forceTransaction: true`
  to `startInactiveSpan` so the user-named span is a child transaction of the page root.
- **`emitLog(level, message)`** — emit the log with the page root active so its `parent_id`
  is the page root: `Sentry.withActiveSpan(pageRoot, () => Sentry.logger[level](message, attrs))`.
  (Logs attach directly to the active span's trace; no wrapper span needed.)
- **`sendRequest(kind)`** — run the `fetch` inside
  `startSpan({ name: 'GET /api/'+kind, op: 'http.client', parentSpan: pageRoot, forceTransaction: true }, async () => { … })`
  so the auto-instrumented `http.client` span (and any failure `captureException`) nest under
  the page root instead of becoming their own roots.

`breadcrumb`, `currentTraceId`, and the URL helpers are unchanged.

### Where the `spanStart` subscription lives

Add it in `src/telemetry.ts` (module-level, next to the other module state), so all Sentry
usage stays in that file per `AGENTS.md`. `instrument.ts` keeps only `Sentry.init()` and the
transport wrapper.

## Trade-offs / notes

- **Each interaction becomes its own Sentry "transaction"** (`forceTransaction`). Invisible
  in Uptrace (just a nested span), but worth a one-line note in the README so a reader is
  not surprised that the Network tab shows multiple transaction envelopes for one page.
- **Grouping is per page, not per whole session.** All actions on one page share that page's
  trace; navigating starts a new trace (new page root). This matches Sentry's own
  per-pageload/navigation grouping and gives a clean "what happened on this page" tree.
- **`browser.*` resource spans** remain children of the pageload root (unchanged). The tree
  becomes: `pageload — /` → { `browser.*` … , each interaction … }.

## Verification

- `npm run build` (type-check + build).
- Manual: `npm run dev`, load a page, fire each signal (error, custom span, HTTP ok/slow/fail,
  log), then open the trace in Uptrace via the Inspector link and confirm **every** signal
  appears **inside** the one `pageload`/`navigation` tree — not missing, not as a separate
  root. Repeat after a route navigation to confirm the new page's root captures its actions.
- Confirm `totalSpanCount` in the trace view equals the number of spans actually drawn (no
  dropped roots).

## Docs to update in the same change

- `AGENTS.md` — restate the rule: signals are **nested under the page root** (still never
  `startNewTrace`); note the Uptrace single-root reason.
- `README.md` — one line on the single-tree behavior and the per-interaction transaction note.
