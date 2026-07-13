import { test, expect } from '@playwright/test'
import { captureTransactions } from './helpers/envelopes'

test('navigating to a route mints a new trace named by its pattern', async ({ page }) => {
  const txns = await captureTransactions(page)
  await page.goto('/')
  const badge = page.locator('.trace-badge__id')
  await expect(badge).not.toHaveText('—')
  const pageloadTrace = (await badge.textContent())!

  await page.getByRole('link', { name: 'Products' }).click()
  await expect(page).toHaveURL(/\/products\/42$/)
  await page.waitForFunction(() => (window.recordedTransactions?.length ?? 0) >= 2)
  await expect(badge).not.toHaveText(pageloadTrace)

  // The navigation transaction is named by the route pattern, not the concrete id.
  await expect
    .poll(() => txns.find((t) => t.op === 'navigation')?.name, { timeout: 15_000 })
    .toBe('/products/:id')
})

test('a signal fired on a route attaches to that route trace', async ({ page }) => {
  await page.goto('/')
  const pageloadTrace = (await page.locator('.trace-badge__id').textContent())!

  await page.getByRole('link', { name: 'Products' }).click()
  await expect(page).toHaveURL(/\/products\/42$/)
  await page.waitForFunction(() => (window.recordedTransactions?.length ?? 0) >= 2)

  await page.getByRole('button', { name: 'Product not found' }).click()
  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect((last as { kind?: string }).kind).toBe('error')
  expect((last as { traceId?: string }).traceId).not.toBe(pageloadTrace)
})

test('an unknown path renders the not-found page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Not found' }).click()
  await expect(page).toHaveURL(/\/404$/)
  await expect(page.getByText('No route matches')).toBeVisible()

  // the 404 is reported to Uptrace as a PageNotFound error
  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'error', errorType: 'PageNotFound' })
})

test('the redirect route bounces to home', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Redirect' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible()
})
