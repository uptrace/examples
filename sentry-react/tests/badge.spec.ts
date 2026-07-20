import { test, expect } from '@playwright/test'
import { captureTransactions } from './helpers/envelopes'

// The badge must name the trace the app is actually sending on, and follow each
// navigation to the new one. It is how you find the trace in Uptrace, so a stale or
// wrong id is worse than no badge at all.
test('the trace badge names the trace signals are sent on, across navigation', async ({ page }) => {
  const txns = await captureTransactions(page)
  const badge = page.locator('.trace-badge__id')

  await page.goto('/')
  await expect.poll(() => txns.some((t) => t.op === 'pageload'), { timeout: 15_000 }).toBe(true)

  const pageload = txns.find((t) => t.op === 'pageload')!
  await expect(badge).toHaveText(pageload.traceId)

  await page.getByRole('link', { name: 'Products' }).click()
  await expect(page).toHaveURL(/\/products\/42$/)
  await expect.poll(() => txns.some((t) => t.op === 'navigation'), { timeout: 15_000 }).toBe(true)

  const navigation = txns.find((t) => t.op === 'navigation')!
  await expect(badge).toHaveText(navigation.traceId)
})
