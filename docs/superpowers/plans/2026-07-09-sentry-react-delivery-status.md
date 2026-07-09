# sentry-react Delivery-Status Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each telemetry envelope's delivery outcome in the UI (sending / delivered / failed) so a user can tell whether data actually reached Uptrace, without changing what or how Sentry sends.

**Architecture:** A new `src/delivery.ts` wraps `Sentry.makeFetchTransport` to observe each send's result and publishes it to a tiny module-level store. `instrument.ts` installs the wrapper. A new `DeliveryStatus` component reads the store via `useSyncExternalStore` and renders beside the existing `TraceBadge` on both pages.

**Tech Stack:** React 19 (`useSyncExternalStore`), TypeScript strict, `@sentry/react` v10 (`makeFetchTransport`, custom `transport` option), Vite 6.

## Global Constraints

- Working directory: `examples/sentry-react` (git root is `examples/`).
- **No unit-test harness** and adding one is out of scope. Verification for every task is `npm run build` (runs `tsc -b` + `vite build`; the typecheck is the guardrail) passing clean, plus any manual browser check named. Do NOT add a test runner.
- TypeScript `strict`, `noUnusedLocals` / `noUnusedParameters` on — no unused imports/vars.
- Comments use `//` line comments, including on exported types/functions.
- Plain CSS only; tokens live in `src/index.css` `:root`, component styles in `src/App.css`. No new tokens — reuse `--info`, `--danger`, `--muted`, `--accent`, `--line`, `--raised`, `--radius`.
- The transport wrapper only OBSERVES: it must return the inner transport's result unchanged and re-throw on error, never swallowing or altering delivery. No `Sentry.startNewTrace()`.
- Commit after each task with the shown message.

---

### Task 1: Delivery store + reporting transport (`src/delivery.ts`)

**Files:**
- Create: `src/delivery.ts`

**Interfaces:**
- Produces:
  - `type DeliveryState = 'idle' | 'sending' | 'ok' | 'failed'`
  - `interface DeliveryStatus { state: DeliveryState; statusCode?: number; host: string | null }`
  - `makeReportingTransport(options: Parameters<typeof Sentry.makeFetchTransport>[0]): ReturnType<typeof Sentry.makeFetchTransport>`
  - `subscribeDelivery(listener: () => void): () => void`
  - `getDeliverySnapshot(): DeliveryStatus`

- [ ] **Step 1: Create `src/delivery.ts`**

```ts
// delivery.ts — observes whether telemetry envelopes actually reach the ingest
// server and publishes the latest outcome to a tiny store the UI subscribes to.
// It wraps the standard fetch transport; it only watches send results, it never
// changes what or how Sentry sends. This is how the app can show "delivered" vs
// "couldn't reach Uptrace" instead of leaving that only in the Network tab.
import * as Sentry from '@sentry/react'

// DeliveryState is the lifecycle of the most recent envelope send.
export type DeliveryState = 'idle' | 'sending' | 'ok' | 'failed'

// DeliveryStatus is the current snapshot shown in the UI. `host` is the ingest
// host from the DSN, used to name the target in the failure message.
export interface DeliveryStatus {
  state: DeliveryState
  statusCode?: number
  host: string | null
}

// hostFromDsn returns the ingest host (e.g. "localhost:5000") from the DSN, or
// null if the DSN is absent or malformed.
function hostFromDsn(dsn: string | undefined): string | null {
  if (!dsn) {
    return null
  }
  try {
    return new URL(dsn).host
  } catch {
    return null
  }
}

const host = hostFromDsn(import.meta.env.VITE_SENTRY_DSN)

// The single current snapshot. getDeliverySnapshot returns this same reference
// until emit() replaces it, so useSyncExternalStore does not re-render in a loop.
let snapshot: DeliveryStatus = { state: 'idle', host }
const listeners = new Set<() => void>()

// emit replaces the snapshot and notifies subscribers. `host` is always carried
// forward so the failure message can name the target.
function emit(next: { state: DeliveryState; statusCode?: number }): void {
  snapshot = { state: next.state, statusCode: next.statusCode, host }
  for (const listener of listeners) {
    listener()
  }
}

// subscribeDelivery registers a listener and returns an unsubscribe function.
export function subscribeDelivery(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// getDeliverySnapshot returns the current status (stable reference between emits).
export function getDeliverySnapshot(): DeliveryStatus {
  return snapshot
}

// makeReportingTransport wraps the standard fetch transport and reports each
// send's outcome. A rejected send (server down / CORS) is a failure; a resolved
// send with an HTTP status >= 400 (rejected token/project) is a failure; anything
// else is a success. The inner result/error is passed through untouched.
export function makeReportingTransport(
  options: Parameters<typeof Sentry.makeFetchTransport>[0],
): ReturnType<typeof Sentry.makeFetchTransport> {
  const inner = Sentry.makeFetchTransport(options)
  return {
    send: async (request) => {
      emit({ state: 'sending' })
      try {
        const result = await inner.send(request)
        const code = result?.statusCode
        emit(
          code && code >= 400
            ? { state: 'failed', statusCode: code }
            : { state: 'ok', statusCode: code },
        )
        return result
      } catch (err) {
        emit({ state: 'failed' })
        throw err
      }
    },
    flush: (timeout) => inner.flush(timeout),
  }
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: PASS. `delivery.ts` is not imported yet but must type-check. If the `Parameters<...>`/`ReturnType<...>` helper types error, confirm `@sentry/react` v10 exports `makeFetchTransport` (`node -e "console.log(typeof require('@sentry/react').makeFetchTransport)"` → `function`).

- [ ] **Step 3: Commit**

```bash
git add src/delivery.ts
git commit -m "feat(sentry-react): add delivery store and reporting transport wrapper"
```

---

### Task 2: Install the transport + render the indicator

**Files:**
- Modify: `src/instrument.ts` (add `transport`)
- Create: `src/components/DeliveryStatus.tsx`
- Modify: `src/pages/TodoList.tsx` (render `<DeliveryStatus/>` beside `<TraceBadge/>`)
- Modify: `src/pages/TodoDetail.tsx` (render `<DeliveryStatus/>` beside `<TraceBadge/>`)
- Modify: `src/App.css` (add `.delivery*` styles)

**Interfaces:**
- Consumes (Task 1): `makeReportingTransport` in `instrument.ts`; `subscribeDelivery`, `getDeliverySnapshot`, `DeliveryStatus` type in the component.
- Produces: `function DeliveryStatus(): JSX.Element`.

- [ ] **Step 1: Add the transport to `src/instrument.ts`**

Add the import near the top (after the existing imports), and the `transport` line inside `Sentry.init({...})`. The current `instrument.ts` imports `* as Sentry` and the router hooks, and calls `Sentry.init({ dsn, integrations: [...], enableLogs: true, tracesSampleRate: 1.0, sendDefaultPii: true, environment: 'development' })`.

Add this import:

```ts
import { makeReportingTransport } from './delivery'
```

Add this property inside the `Sentry.init({...})` object (place it right after the `dsn,` line):

```ts
  // Wrap the standard fetch transport so the UI can show whether each envelope
  // actually reached the ingest server (see src/delivery.ts and the delivery
  // status line in the UI). It only observes; it does not change delivery.
  transport: makeReportingTransport,
```

- [ ] **Step 2: Create `src/components/DeliveryStatus.tsx`**

```tsx
// DeliveryStatus shows whether the most recent telemetry envelope reached the
// ingest server. It reads the delivery store (src/delivery.ts) — updated by the
// reporting transport — so both success and failure are visible in the UI, not
// just in the devtools Network tab.
import { useSyncExternalStore } from 'react'
import { subscribeDelivery, getDeliverySnapshot } from '../delivery'
import type { DeliveryStatus as Status } from '../delivery'

// message returns the label for a delivery status.
function message(status: Status): string {
  switch (status.state) {
    case 'idle':
      return 'No data sent yet'
    case 'sending':
      return 'Sending to Uptrace…'
    case 'ok':
      return 'Delivered to Uptrace ✓'
    case 'failed':
      return status.host
        ? `Delivery failed — couldn't reach ${status.host} (is it running? DSN correct?)`
        : "Delivery failed — couldn't reach the ingest server (is it running? DSN correct?)"
  }
}

export function DeliveryStatus() {
  const status = useSyncExternalStore(subscribeDelivery, getDeliverySnapshot)
  return (
    <div className="delivery" data-state={status.state}>
      <span className="delivery__dot" aria-hidden="true" />
      <span className="delivery__text">{message(status)}</span>
    </div>
  )
}
```

- [ ] **Step 3: Render it beside `<TraceBadge/>` in `src/pages/TodoList.tsx`**

Add the import alongside the existing `TraceBadge` import:

```tsx
import { DeliveryStatus } from '../components/DeliveryStatus'
```

In the JSX, the demo section currently ends with `<TraceBadge />`. Add `<DeliveryStatus />` immediately after it:

```tsx
        <TraceBadge />
        <DeliveryStatus />
```

- [ ] **Step 4: Render it beside `<TraceBadge/>` in `src/pages/TodoDetail.tsx`**

Add the import alongside the existing `TraceBadge` import:

```tsx
import { DeliveryStatus } from '../components/DeliveryStatus'
```

The page currently ends with `<TraceBadge />` before the closing `</main>`. Add `<DeliveryStatus />` immediately after it:

```tsx
      <TraceBadge />
      <DeliveryStatus />
```

- [ ] **Step 5: Add `.delivery*` styles to `src/App.css`**

Append at the end of the file:

```css
/* Delivery status ------------------------------------------------------- */

.delivery {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 0.8rem;
  /* The dot and text color follow the delivery state. */
  --signal: var(--muted);
}

.delivery[data-state='sending'] {
  --signal: var(--info);
}

.delivery[data-state='ok'] {
  --signal: oklch(0.6 0.13 150);
}

.delivery[data-state='failed'] {
  --signal: var(--danger);
}

.delivery__dot {
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--signal);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--signal) 18%, transparent);
}

.delivery__text {
  min-width: 0;
  color: var(--signal);
  font-weight: 560;
}
```

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: PASS, clean. If `noUnusedLocals` flags the `Status` type import, confirm it's used in `message(status: Status)`.

- [ ] **Step 7: Commit**

```bash
git add src/instrument.ts src/components/DeliveryStatus.tsx src/pages/TodoList.tsx src/pages/TodoDetail.tsx src/App.css
git commit -m "feat(sentry-react): show telemetry delivery status in the UI"
```

- [ ] **Step 8: Manual browser verification (controller runs this)**

Run `npm run dev`. Then:
1. With the ingest reachable: click a demo button → the line shows `Sending to Uptrace…` then `Delivered to Uptrace ✓` (green).
2. Simulate failure: stop the ingest server, OR temporarily set `VITE_SENTRY_DSN` to an unreachable host and restart dev. Click a button → `Delivery failed — couldn't reach {host} …` (red). Restore and confirm it returns to `Delivered ✓` on the next send.
3. The dot color tracks state; no console errors from the wrapper.

---

### Task 3: Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `README.md`**

- In the intro bullet list (the "You'll be able to" section), add a bullet: a live **delivery-status** line shows whether each envelope actually reached Uptrace (so you can tell a working setup from a broken one).
- In the "If nothing shows up" troubleshooting paragraph near the end of section 4, add a sentence pointing at the delivery-status line: if it reads "Delivery failed", the DSN host is unreachable or wrong — check that Uptrace is running and the DSN host matches your ingest address.
- In the **Project layout** table, add two rows: `src/delivery.ts` (wraps the fetch transport to observe delivery, publishes status) and `src/components/DeliveryStatus.tsx` (the delivery-status line).

- [ ] **Step 2: Update `AGENTS.md`**

- In the core rule about `Sentry.init()` being the only Uptrace-specific wiring, add a clause: `instrument.ts` also installs a reporting transport wrapper (`src/delivery.ts`) that observes send outcomes for the UI — it wraps the standard fetch transport and does not change delivery, so it is not an Uptrace-specific adapter.

- [ ] **Step 3: Verify docs match reality**

Run: `grep -rn "delivery\|DeliveryStatus\|makeReportingTransport" README.md AGENTS.md`
Expected: matches present (the new rows/notes exist).

Run: `npm run build`
Expected: PASS (docs-only sanity check).

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs(sentry-react): document the delivery-status indicator"
```

---

## Notes for the implementer

- **Observe-only invariant:** `makeReportingTransport` must return the inner `send` result and re-throw the inner error unchanged. Do not add retries, do not swallow. The emit calls are the only additions.
- **Stable snapshot:** `getDeliverySnapshot` must return the same object reference until `emit` replaces it — never build a new object inside `getDeliverySnapshot`, or `useSyncExternalStore` will loop. The plan's code does this correctly (returns the module-level `snapshot`).
- **Transport timing:** `instrument.ts` runs before React; the store is plain module state, so it is ready when the transport fires. The component simply subscribes on mount and gets the current snapshot.
- **`DeliveryState` exhaustiveness:** the `switch` in `message()` covers all four states; TypeScript's `strict` will not require a default, and adding one would make the `noFallthroughCasesInSwitch` check moot — leave it without a default so a future new state is a compile error.
