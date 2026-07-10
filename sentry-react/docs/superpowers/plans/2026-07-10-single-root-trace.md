# Single-root trace for Uptrace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each page's Sentry trace render as a single tree in Uptrace by nesting every user interaction under the pageload/navigation root span, instead of letting interactions become sibling roots that Uptrace drops.

**Architecture:** Reuse the pageload/navigation root the browser-tracing integration already opens. Capture it via the client's `spanStart` hook (installed right after `Sentry.init`), then start each interaction as a child *transaction* of that root using `Sentry.startSpan({ parentSpan, forceTransaction: true })`. No `startNewTrace`; no Uptrace changes.

**Tech Stack:** Vite + React 19 + TypeScript (strict), `@sentry/react` v10, Playwright for e2e.

## Global Constraints

- Node **20+** required (README already states this).
- TypeScript `strict` on; JS/TS comments use `//` line comments, including for exported types/functions.
- **No new dependencies.**
- **Never call `Sentry.startNewTrace()`** — the trace comes only from the pageload browser-tracing integration in `instrument.ts`. This change keeps that rule; it only changes interactions from *sibling roots* to *children* of the page root.
- All Sentry SDK usage lives in `src/telemetry.ts`; `src/instrument.ts` holds only `Sentry.init()`, the transport wrapper, the event processor, and (new) the one-line call that installs page-root tracking.
- Plain CSS only; no new UI deps. DSN comes from `VITE_SENTRY_DSN`; never hardcode.
- Verification per change: `npm run build` (runs `tsc -b` + build) and the Playwright specs. Also run `npm run dev` and click through when behavior changes.

---

## File Structure

- **Modify** `src/telemetry.ts` — add `pageRoot` module state, `installPageRootTracking()`, and an internal `nested()` helper; route `reportError`, `startNamedSpan`, `emitLog`, `sendRequest` through the page root.
- **Modify** `src/instrument.ts` — call `installPageRootTracking()` immediately after `Sentry.init()`.
- **Create** `tests/helpers/envelopes.ts` — Playwright helper that intercepts Sentry envelopes and collects transaction trace-contexts.
- **Create** `tests/nesting.spec.ts` — asserts interaction transactions carry `parent_span_id = pageload span_id` on the same trace.
- **Modify** `AGENTS.md`, `README.md` — document the nesting behavior and the per-interaction-transaction note.

---

## Task 1: Capture the page root and nest the custom span

**Files:**
- Modify: `src/telemetry.ts`
- Modify: `src/instrument.ts`
- Create: `tests/helpers/envelopes.ts`
- Create: `tests/nesting.spec.ts`

**Interfaces:**
- Produces: `installPageRootTracking(): void` (exported from `telemetry.ts`, called by `instrument.ts`); internal `pageRoot: Sentry.Span | undefined`; internal `nested<T>(options, cb): T`.
- Consumes: `@sentry/react` v10 APIs `getClient().on('spanStart')`, `spanToJSON`, `startSpan`, `startInactiveSpan` with `{ parentSpan, forceTransaction }`.

- [ ] **Step 1: Write the Playwright envelope helper**

Create `tests/helpers/envelopes.ts`:

```ts
import type { Page } from '@playwright/test'

// CapturedTransaction is the trace-context of one transaction item pulled from a
// Sentry envelope, enough to check trace/parent linkage.
export interface CapturedTransaction {
  traceId: string
  spanId: string
  parentSpanId?: string
  op?: string
  name?: string
}

// captureTransactions intercepts Sentry envelopes POSTed to the ingest endpoint,
// fulfilling them locally (so no real Uptrace is needed) and collecting every
// transaction item's trace context into the returned array. A Sentry envelope is
// a header line followed by (item-header, item-payload) line pairs; transaction
// payloads are single-line JSON.
export async function captureTransactions(page: Page): Promise<CapturedTransaction[]> {
  const out: CapturedTransaction[] = []
  await page.route('**/envelope/**', async (route) => {
    const body = route.request().postData() ?? ''
    const [, ...items] = body.split('\n').filter(Boolean)
    for (let i = 0; i + 1 < items.length; i += 2) {
      let header: { type?: string }
      try {
        header = JSON.parse(items[i])
      } catch {
        continue
      }
      if (header.type !== 'transaction') continue
      const payload = JSON.parse(items[i + 1])
      const trace = payload.contexts?.trace ?? {}
      out.push({
        traceId: trace.trace_id,
        spanId: trace.span_id,
        parentSpanId: trace.parent_span_id,
        op: trace.op,
        name: payload.transaction,
      })
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  return out
}
```

- [ ] **Step 2: Write the failing nesting test**

Create `tests/nesting.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { captureTransactions } from './helpers/envelopes'

test('a custom span is emitted as a child of the pageload root', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  await page.getByLabel('Span name').fill('nested-span')
  await page.getByRole('button', { name: 'Start span' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Stop span' }).click()

  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => txns.some((t) => t.name === 'nested-span'), { timeout: 15_000 }).toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const span = txns.find((t) => t.name === 'nested-span')!
  expect(span.traceId).toBe(pageload.traceId)
  expect(span.parentSpanId).toBe(pageload.spanId)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test tests/nesting.spec.ts`
Expected: FAIL — before the change the custom span is a root, so `span.parentSpanId` is `undefined`, not `pageload.spanId`.

- [ ] **Step 4: Add page-root tracking and the `nested` helper in `telemetry.ts`**

At the top of `src/telemetry.ts`, after the imports, add module state, the installer, and the helper:

```ts
// pageRoot holds the current page's root span — the pageload/navigation transaction
// the browser-tracing integration opened. Interactions nest under it so the whole
// page is one tree with a single root in Uptrace (which shows only one root per
// trace). Refreshed on every navigation via the spanStart hook.
let pageRoot: Sentry.Span | undefined

// installPageRootTracking subscribes to the client's spanStart hook to remember the
// current page root. Call it once right after Sentry.init (from instrument.ts): the
// pageload span starts during init, before this module is first imported, so
// subscribing lazily here would miss it.
export function installPageRootTracking(): void {
  Sentry.getClient()?.on('spanStart', (span) => {
    const { parent_span_id: parentSpanId, op } = Sentry.spanToJSON(span)
    if (!parentSpanId && (op === 'pageload' || op === 'navigation')) {
      pageRoot = span
    }
  })
}

// nested runs a span as a child transaction of the current page root, so the
// interaction attaches under the page's tree instead of becoming a sibling root.
// forceTransaction makes it its own sent envelope; parentSpan stamps the page
// root's trace id and span id onto it (works even after the pageload transaction
// ended — only its spanContext is read). When pageRoot is undefined (before the
// first pageload span), it falls back to the active span/scope: today's behavior.
function nested<T>(options: Parameters<typeof Sentry.startSpan>[0], cb: (span: Sentry.Span) => T): T {
  return Sentry.startSpan({ ...options, parentSpan: pageRoot, forceTransaction: true }, cb)
}
```

- [ ] **Step 5: Call the installer from `instrument.ts`**

In `src/instrument.ts`, import it and call it immediately after `Sentry.init(...)`, before the `addEventProcessor` block:

```ts
import { makeReportingTransport } from './delivery'
import { installPageRootTracking } from './telemetry'

// ...Sentry.init({ ... }) as today...

// Track the pageload/navigation root span so telemetry.ts can nest interactions
// under it (Uptrace shows only one root per trace). Installed here, right after
// init, so the initial pageload span is captured.
installPageRootTracking()
```

- [ ] **Step 6: Route the custom span through `nested`**

In `src/telemetry.ts`, change `startNamedSpan` to parent the span under the page root (only this function changes in this step):

```ts
export function startNamedSpan(name: string): NamedSpan {
  breadcrumb(`Started span "${name}"`)
  const span = Sentry.startInactiveSpan({
    name,
    op: 'ui.custom',
    parentSpan: pageRoot,
    forceTransaction: true,
  })
  return { span, name, startedAt: performance.now() }
}
```

- [ ] **Step 7: Run the nesting test to verify it passes**

Run: `npx playwright test tests/nesting.spec.ts`
Expected: PASS — the custom span now carries `parent_span_id = pageload span_id` on the same trace.

- [ ] **Step 8: Run the existing specs and the build to verify no regressions**

Run: `npm run build`
Expected: PASS (type-check + build clean).
Run: `npx playwright test tests/spans.spec.ts`
Expected: PASS (span still recorded with a name, positive duration, and a 16-hex span id).

- [ ] **Step 9: Commit**

```bash
git add src/telemetry.ts src/instrument.ts tests/helpers/envelopes.ts tests/nesting.spec.ts
git commit -m "feat(sentry-react): nest custom spans under the page root"
```

---

## Task 2: Nest reported errors

**Files:**
- Modify: `src/telemetry.ts`
- Test: `tests/errors.spec.ts` (regression only)

**Interfaces:**
- Consumes: internal `nested()` from Task 1.

- [ ] **Step 1: Route `reportError` through `nested`**

In `src/telemetry.ts`, wrap the capture so the error attaches to a child span of the page root:

```ts
export function reportError(type: ErrorType): void {
  breadcrumb(`Reporting a ${type}`)
  const err = buildError(type)
  nested({ name: `error: ${type}`, op: 'ui.error' }, () => {
    Sentry.captureException(err)
  })
  push({ kind: 'error', label: err.message, errorType: type, traceId: currentTraceId() })
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Run the errors spec to verify no regression**

Run: `npx playwright test tests/errors.spec.ts`
Expected: PASS — an error signal is still recorded with `errorType` and a truthy `traceId`, and the Inspector still shows the error type.

- [ ] **Step 4: Commit**

```bash
git add src/telemetry.ts
git commit -m "feat(sentry-react): nest reported errors under the page root"
```

---

## Task 3: Nest logs and HTTP requests

**Files:**
- Modify: `src/telemetry.ts`
- Modify: `tests/nesting.spec.ts`
- Test: `tests/logs.spec.ts`, `tests/http.spec.ts` (regression)

**Interfaces:**
- Consumes: internal `nested()` and `pageRoot` from Task 1.

- [ ] **Step 1: Extend the nesting test to assert the HTTP transaction nests**

Append to `tests/nesting.spec.ts`:

```ts
test('an HTTP request span is a child of the pageload root', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'ok', exact: true }).click()

  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => txns.some((t) => t.name === 'GET /api/ok'), { timeout: 15_000 }).toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const http = txns.find((t) => t.name === 'GET /api/ok')!
  expect(http.traceId).toBe(pageload.traceId)
  expect(http.parentSpanId).toBe(pageload.spanId)
})
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx playwright test tests/nesting.spec.ts -g "HTTP request span"`
Expected: FAIL — the HTTP wrapper transaction does not exist yet / has no `parent_span_id` matching the pageload span.

- [ ] **Step 3: Route `emitLog` through the page root**

In `src/telemetry.ts`, emit the log with the page root active so its parent is the page root:

```ts
export function emitLog(level: LogLevel, message: string): void {
  breadcrumb(`Log ${level}: ${message}`)
  const attributes = { source: 'signal-console' }
  const write = () => {
    if (level === 'info') {
      Sentry.logger.info(message, attributes)
    } else if (level === 'warn') {
      Sentry.logger.warn(message, attributes)
    } else {
      Sentry.logger.error(message, attributes)
    }
  }
  if (pageRoot) {
    Sentry.withActiveSpan(pageRoot, write)
  } else {
    write()
  }
  push({ kind: 'log', label: message, level, traceId: currentTraceId() })
}
```

- [ ] **Step 4: Route `sendRequest` through `nested`**

In `src/telemetry.ts`, wrap the fetch (and its failure capture) in a child transaction named `GET /api/<kind>` with op `http`, so the auto-instrumented `http.client` span nests under it:

```ts
export async function sendRequest(kind: RequestKind): Promise<void> {
  breadcrumb(`Sending ${kind} request`)
  const startedAt = performance.now()
  await nested({ name: `GET /api/${kind}`, op: 'http' }, async () => {
    try {
      const res = await fetch(`/api/${kind}`)
      const durationMs = Math.round(performance.now() - startedAt)
      push({
        kind: 'http',
        label: `GET /api/${kind}`,
        durationMs,
        detail: `HTTP ${res.status}`,
        traceId: currentTraceId(),
      })
      if (!res.ok) {
        const err = new Error(`Request to /api/${kind} failed: HTTP ${res.status}`)
        Sentry.captureException(err)
        push({ kind: 'error', label: err.message, errorType: 'Error', traceId: currentTraceId() })
      }
    } catch (e) {
      const durationMs = Math.round(performance.now() - startedAt)
      Sentry.captureException(e)
      push({
        kind: 'http',
        label: `GET /api/${kind}`,
        durationMs,
        detail: 'network error',
        traceId: currentTraceId(),
      })
    }
  })
}
```

- [ ] **Step 5: Run the build and the nesting/regression specs**

Run: `npm run build`
Expected: PASS.
Run: `npx playwright test tests/nesting.spec.ts tests/logs.spec.ts tests/http.spec.ts`
Expected: PASS — HTTP transaction nests under the pageload root; logs and HTTP signals still recorded as before.

- [ ] **Step 6: Commit**

```bash
git add src/telemetry.ts tests/nesting.spec.ts
git commit -m "feat(sentry-react): nest logs and HTTP requests under the page root"
```

---

## Task 4: Documentation and live Uptrace verification

**Files:**
- Modify: `src/telemetry.ts` (header comment), `AGENTS.md`, `README.md`

- [ ] **Step 1: Update the `telemetry.ts` header comment**

Replace the leading comment's second sentence so it reflects nesting:

```ts
// telemetry.ts — every Sentry SDK call the app makes lives here, isolated from
// the UI. Nothing here starts a new trace: every signal attaches to the current
// pageload/navigation trace and is NESTED under that page's root span, so Uptrace
// (which shows one root per trace) draws the whole page as a single tree. Each
// call also records a breadcrumb and pushes a record to the signals store for the
// in-page Inspector.
```

- [ ] **Step 2: Update `AGENTS.md`**

In the Core Rules bullet about signals attaching to the trace, replace the hard rule wording with:

```markdown
  Hard rule: never call `Sentry.startNewTrace()` — the trace comes only from the
  pageload browser-tracing integration in `instrument.ts`. Every signal attaches
  to that trace **nested under the page's root span** (via `startSpan`/
  `startInactiveSpan` with `parentSpan` + `forceTransaction`, wired in
  `telemetry.ts`), because Uptrace renders only one root span per trace — sibling
  roots would be dropped from the trace tree.
```

- [ ] **Step 3: Update `README.md`**

Add a short subsection near the tracing description:

```markdown
### One trace, one tree

Every signal on a page (custom spans, errors, HTTP, logs) is nested under that
page's pageload/navigation root span, so opening the trace in Uptrace shows one
tree with everything in it. Uptrace stores one root span per trace, so signals are
attached as children rather than as separate roots. Each interaction is therefore
sent as its own Sentry transaction — you will see multiple transaction envelopes
for one page in the Network tab; in Uptrace they appear as one nested tree.
```

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Live-verify against Uptrace (manual)**

Run: `npm run dev`. With a real `VITE_SENTRY_DSN`/`VITE_UPTRACE_URL` in `.env`:
1. Load `/`, then fire each signal: Start/Stop a named span, throw a `RangeError`, send `ok`/`slow`/`fail` HTTP, emit an `info`/`warn`/`error` log.
2. Click the Inspector's trace link to open the trace in Uptrace.
3. Confirm the trace shows a single `pageload — /` root with the `browser.*` spans **and** every interaction nested beneath it — nothing missing, no interaction shown as a separate/dropped root.
4. Confirm `totalSpanCount` equals the number of spans drawn.
5. Navigate to `/item/42`, fire a log/error there, open that trace, and confirm the same single-tree shape under the `navigation` root.

Pay special attention to the **log** and **error** signals (the least certain to nest): confirm they appear under the page root in the tree, not only in the Logs & Errors tab.

- [ ] **Step 6: Commit**

```bash
git add src/telemetry.ts AGENTS.md README.md
git commit -m "docs(sentry-react): document single-tree trace nesting"
```

---

## Self-Review notes

- **Spec coverage:** page-root tracking (Task 1), all four feature calls — custom span (T1), error (T2), log + HTTP (T3) — the `instrument.ts` install-timing fix (T1, corrects the spec's "subscription in telemetry.ts" location), docs (T4), and both automated (transaction nesting) and manual (Uptrace tree, incl. log/error) verification. Covered.
- **Placeholders:** none — every code and test step is complete.
- **Type consistency:** `installPageRootTracking()`, `pageRoot`, and `nested()` are defined in Task 1 and only consumed (not redefined) in Tasks 2–3; `nested` uses `Parameters<typeof Sentry.startSpan>[0]` so option typing matches the SDK.
- **Known-uncertain step:** log/error nesting is verified manually against Uptrace (Task 4 Step 5) since their wire shape (event/log items) isn't a transaction envelope the automated helper inspects.
