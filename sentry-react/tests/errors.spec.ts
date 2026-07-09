import { test, expect } from '@playwright/test'

test('each error button records a typed error signal on the current trace', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'RangeError', exact: true }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'error', errorType: 'RangeError' })
  expect((last as { traceId?: string }).traceId).toBeTruthy()

  await expect(page.locator('.inspector')).toContainText('RangeError')
})
