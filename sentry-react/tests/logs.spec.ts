import { test, expect } from '@playwright/test'

test('a log button records a log signal at the chosen level', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'warn', exact: true }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'log', level: 'warn' })
})
