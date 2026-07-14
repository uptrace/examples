import { test, expect } from '@playwright/test'
import { captureTransactions } from './helpers/envelopes'

// The ids a signal reports must be the ids of the span it actually sent, or the
// inspector's /traces/<traceId>/<spanId> deep link points at a span that does not
// live in that trace.
test('a completed todo reports the trace and span ids of the span it sent', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  // Complete the todo after the pageload idle span has ended, so there is no active
  // span and the trace id can only come from the span or the scope's fallback.
  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByLabel('Todo text').fill('paired')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Done' }).click()

  await expect
    .poll(() => txns.some((t) => t.name === 'completed todo: paired'), { timeout: 15_000 })
    .toBe(true)

  const sent = txns.find((t) => t.name === 'completed todo: paired')!
  const reported = (await page.evaluate(() => (window.__signals ?? []).at(-1))) as {
    traceId?: string
    spanId?: string
  }

  expect(reported.spanId).toBe(sent.spanId)
  expect(reported.traceId).toBe(sent.traceId)
})
