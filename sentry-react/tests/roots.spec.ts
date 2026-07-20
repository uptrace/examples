import { test, expect } from '@playwright/test'
import { captureTransactions } from './helpers/envelopes'

// What Uptrace has to cope with: one trace holding several root spans. The SDK is
// left alone — the app never re-parents a span — so every interaction after the
// pageload transaction has ended is sent as its own root span on the page's trace.

test('an interaction span is a root span on the pageload trace', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  // Wait for the pageload transaction to be sent (its idle span has ended) BEFORE
  // interacting, so the new span cannot become a child of a still-active pageload
  // span — it has to stand on its own.
  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByLabel('Todo text').fill('root-todo')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Done' }).click()

  await expect
    .poll(() => txns.some((t) => t.name === 'completed todo: root-todo'), { timeout: 15_000 })
    .toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const span = txns.find((t) => t.name === 'completed todo: root-todo')!
  expect(span.traceId).toBe(pageload.traceId)
  expect(span.parentSpanId).toBeUndefined()
})

test('an HTTP request span is a root span on the pageload trace', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByRole('button', { name: 'OK (200)', exact: true }).click()

  await expect.poll(() => txns.some((t) => t.name === 'GET /api/ok'), { timeout: 15_000 }).toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const http = txns.find((t) => t.name === 'GET /api/ok')!
  expect(http.traceId).toBe(pageload.traceId)
  expect(http.parentSpanId).toBeUndefined()
})

test('several interactions share one trace as separate roots', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByLabel('Todo text').fill('first')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: 'OK (200)', exact: true }).click()

  await expect
    .poll(() => txns.some((t) => t.name === 'created todo: first') && txns.some((t) => t.name === 'GET /api/ok'), {
      timeout: 15_000,
    })
    .toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const roots = txns.filter((t) => t.name === 'created todo: first' || t.name === 'GET /api/ok')

  // One trace, several roots — the shape Uptrace's trace view has to render.
  expect(roots).toHaveLength(2)
  for (const root of roots) {
    expect(root.traceId).toBe(pageload.traceId)
    expect(root.parentSpanId).toBeUndefined()
  }
  expect(new Set(roots.map((r) => r.spanId)).size).toBe(2)
})
