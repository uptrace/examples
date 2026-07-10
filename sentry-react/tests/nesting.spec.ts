import { test, expect } from '@playwright/test'
import { captureTransactions } from './helpers/envelopes'

test('a custom span is emitted as a child of the pageload root', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  // Wait for the pageload transaction to be sent (the idle span has ended)
  // BEFORE interacting, so the interaction can no longer piggyback on the
  // still-active pageload span via the active-span fallback — it must rely
  // on the tracked page root instead.
  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByLabel('Span name').fill('nested-span')
  await page.getByRole('button', { name: 'Start span' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Stop span' }).click()

  await expect.poll(() => txns.some((t) => t.name === 'nested-span'), { timeout: 15_000 }).toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const span = txns.find((t) => t.name === 'nested-span')!
  expect(span.traceId).toBe(pageload.traceId)
  expect(span.parentSpanId).toBe(pageload.spanId)
})

test('an HTTP request span is a child of the pageload root', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  // Wait for the pageload transaction to be sent (the idle span has ended)
  // BEFORE interacting, so the request span can no longer piggyback on the
  // still-active pageload span via the active-span fallback — it must rely
  // on the tracked page root instead.
  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByRole('button', { name: 'OK (200)', exact: true }).click()

  await expect.poll(() => txns.some((t) => t.name === 'GET /api/ok'), { timeout: 15_000 }).toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const http = txns.find((t) => t.name === 'GET /api/ok')!
  expect(http.traceId).toBe(pageload.traceId)
  expect(http.parentSpanId).toBe(pageload.spanId)
})

test('a captured error is a child of the pageload root', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')

  // Wait for the pageload transaction to be sent (the idle span has ended)
  // BEFORE interacting, so the error span can no longer piggyback on the
  // still-active pageload span via the active-span fallback — it must rely
  // on the tracked page root instead.
  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByRole('button', { name: 'RangeError', exact: true }).click()

  await expect.poll(() => txns.some((t) => t.op === 'ui.error'), { timeout: 15_000 }).toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  const error = txns.find((t) => t.op === 'ui.error')!
  expect(error.name).toBe('error: RangeError')
  expect(error.traceId).toBe(pageload.traceId)
  expect(error.parentSpanId).toBe(pageload.spanId)
})
