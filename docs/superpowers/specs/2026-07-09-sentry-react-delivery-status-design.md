# sentry-react — telemetry delivery-status indicator

Date: 2026-07-09
Scope: `examples/sentry-react`
Status: approved design, pending spec review
Builds on: 2026-07-09-sentry-react-signal-model-design.md (already implemented)

## Problem

When an envelope fails to reach the ingest server (Uptrace or Sentry) — the
server is down, the DSN host is wrong, CORS blocks it, or the token/project is
rejected — the app shows nothing. The failure is visible only in the devtools
Network tab. A user running the example has no intuitive signal that their data
never arrived, and success is equally invisible, so they cannot tell a working
setup from a broken one.

## Goal

Surface each envelope's delivery outcome in the UI: confirm success and show
failures clearly, without changing what or how Sentry sends.

## Design

### 1. Reporting transport wrapper — `src/delivery.ts` (new)

Sentry accepts a custom `transport` factory in `init()`. Wrap the built-in one:

```ts
export function makeReportingTransport(options) {
  const inner = Sentry.makeFetchTransport(options)
  return {
    send: async (request) => {
      emit({ state: 'sending' })
      try {
        const result = await inner.send(request)
        const code = result?.statusCode
        emit(code && code >= 400
          ? { state: 'failed', statusCode: code }
          : { state: 'ok', statusCode: code })
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

Rules:

- The wrapper only observes. It returns the inner result unchanged and
  re-throws on error, so Sentry's own retry / rate-limit / offline logic is
  untouched.
- Outcome classification: reject (network/CORS/server down) → `failed`;
  resolve with `statusCode >= 400` (bad token/project) → `failed`; resolve with
  `statusCode < 400` or no status → `ok`.
- `host` for the message is derived once from the DSN
  (`new URL(dsn).host`) so the failure text can name it; null-safe.

### 2. Delivery store — same file

A minimal module-level store (no React) so the transport (created before React
in `instrument.ts`) can publish and a component can subscribe:

- `type DeliveryState = 'idle' | 'sending' | 'ok' | 'failed'`
- `interface DeliveryStatus { state: DeliveryState; statusCode?: number; host: string | null }`
- `subscribeDelivery(listener: () => void): () => void`
- `getDeliverySnapshot(): DeliveryStatus` — returns a stable reference until the
  status changes (so `useSyncExternalStore` doesn't loop).
- internal `emit(partial)` updates the snapshot (merging `host`) and notifies
  listeners.
- initial snapshot: `{ state: 'idle', host }`.

### 3. Wiring — `src/instrument.ts`

Add `transport: makeReportingTransport` to the existing `Sentry.init({...})`.
No other change.

### 4. UI — `src/components/DeliveryStatus.tsx` (new)

- Reads the store with `useSyncExternalStore(subscribeDelivery, getDeliverySnapshot)`.
- Renders a colored dot + text keyed on `state`:
  - `idle` → "No data sent yet" (muted)
  - `sending` → "Sending to Uptrace…" (amber / `--info`)
  - `ok` → "Delivered to Uptrace ✓" (green)
  - `failed` → "Delivery failed — couldn't reach {host} (is it running? DSN correct?)" (red / `--danger`)
- Rendered directly beside `<TraceBadge/>` on both `TodoList` and `TodoDetail`.
- Latest outcome only — no tally.

### 5. Styles — `src/App.css`

Add `.delivery`, `.delivery__dot`, `.delivery__text` rules mirroring the
`.trace-badge` look, using a `--signal` custom property switched by a
`data-state` attribute (green for ok, `--danger` for failed, `--info` for
sending, `--muted` for idle). Reuse existing tokens; no new tokens.

### 6. Docs

- `README.md`: a short note that the app shows a live delivery-status line (so
  you can tell whether data actually reached Uptrace), and a project-layout row
  for `src/delivery.ts` + `src/components/DeliveryStatus.tsx`.
- `AGENTS.md`: note that `instrument.ts` now also installs a reporting transport
  wrapper (`delivery.ts`) — still not an Uptrace-specific adapter, just an
  observer around the standard fetch transport.

## Out of scope

- No tally / history / per-signal breakdown.
- No retry/queue UI; the wrapper never alters Sentry's delivery behavior.
- No test harness (unchanged repo policy; verification is `npm run build` +
  manual browser check).

## Verification

- `npm run build` passes clean.
- Manual: with Uptrace/ingest reachable, an action shows `sending…` then
  `Delivered ✓`. With the ingest host down (or a bad DSN host), an action shows
  `Delivery failed — couldn't reach {host}`. Recovers to `Delivered ✓` on the
  next successful send.
