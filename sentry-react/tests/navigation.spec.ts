import { test, expect } from '@playwright/test'
import { captureTransactions } from './helpers/envelopes'

// Each navigation must mint a new trace named by its route pattern, not the concrete
// URL: that is the low-cardinality grouping Uptrace shows navigations under.
test('navigating mints a new trace named by its route pattern', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')
  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  await page.getByRole('link', { name: 'Products' }).click()
  await expect(page).toHaveURL(/\/products\/42$/)

  await expect
    .poll(() => txns.find((t) => t.op === 'navigation')?.name, { timeout: 15_000 })
    .toBe('/products/:id')

  // A new trace, not a continuation of the pageload one.
  const pageload = txns.find((t) => t.op === 'pageload')!
  const navigation = txns.find((t) => t.op === 'navigation')!
  expect(navigation.traceId).not.toBe(pageload.traceId)
})
