import { test, expect } from '@playwright/test'

test('a named span records its typed name and a positive duration', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Span name').fill('checkout')
  await page.getByRole('button', { name: 'Start span' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Stop span' }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'span', label: 'checkout' })
  expect((last as { durationMs?: number }).durationMs).toBeGreaterThan(0)
})
