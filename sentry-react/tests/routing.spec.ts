import { test, expect } from '@playwright/test'

test('navigating to /item/:id mints a new trace', async ({ page }) => {
  await page.goto('/')

  const badge = page.locator('.trace-badge__id')
  await expect(badge).not.toHaveText('—')
  const pageloadTrace = (await badge.textContent())!

  await page.getByRole('link', { name: 'Item 42' }).click()
  await expect(page).toHaveURL(/\/item\/42$/)

  // pageload transaction + navigation transaction were both recorded
  await page.waitForFunction(() => (window.recordedTransactions?.length ?? 0) >= 2)

  // the badge now reflects a different (navigation) trace id
  await expect(badge).not.toHaveText(pageloadTrace)
})
