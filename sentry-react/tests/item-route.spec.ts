import { test, expect } from '@playwright/test'

test('a signal fired on /item/:id attaches to the navigation trace', async ({ page }) => {
  await page.goto('/')
  const pageloadTrace = (await page.locator('.trace-badge__id').textContent())!

  await page.getByRole('link', { name: 'Item 42' }).click()
  await expect(page).toHaveURL(/\/item\/42$/)
  await page.waitForFunction(() => (window.recordedTransactions?.length ?? 0) >= 2)

  await page.getByRole('button', { name: 'Throw error here' }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect((last as { kind?: string }).kind).toBe('error')
  const traceId = (last as { traceId?: string }).traceId
  expect(traceId).toBeTruthy()
  expect(traceId).not.toBe(pageloadTrace)
})
