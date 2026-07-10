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
    // Assumes every item is exactly two lines (item header + single-line JSON
    // payload), which holds for this app's JSON transaction items.
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
