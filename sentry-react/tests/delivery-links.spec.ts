import { test, expect } from '@playwright/test'

// A signal whose envelope never reached Uptrace has nothing to open there, so the
// inspector must not offer a link to it — the same rule TraceBadge applies.
test('the inspector does not link a signal that failed to reach Uptrace', async ({ page }) => {
  await page.route('**/envelope/**', (route) => route.abort('connectionrefused'))

  await page.goto('/')
  await page.getByRole('button', { name: 'RangeError', exact: true }).click()

  // The signal is still described...
  await expect(page.locator('.inspector')).toContainText('RangeError')
  // ...but not as a link into Uptrace.
  await expect(page.locator('.inspector a.inspector__link')).toHaveCount(0)
})

test('a todo row does not link a span that failed to reach Uptrace', async ({ page }) => {
  await page.route('**/envelope/**', (route) => route.abort('connectionrefused'))

  await page.goto('/')
  await page.getByLabel('Todo text').fill('undelivered')
  await page.getByRole('button', { name: 'Add' }).click()

  // The row is there, but its span never arrived, so there is nothing to open.
  await expect(page.locator('.todo__text')).toHaveText('undelivered')
  await expect(page.locator('.todo a.todo__link')).toHaveCount(0)
})
