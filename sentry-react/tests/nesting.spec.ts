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
