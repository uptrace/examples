import { test, expect } from '@playwright/test'

// A request that never reaches the server captures an exception, so it must surface
// as an error signal too — the same as a non-OK response. Otherwise the inspector
// shows a span while an error is quietly on its way to Uptrace.
test('a request that fails at the network level records an error signal', async ({ page }) => {
  await page.route('**/api/ok', (route) => route.abort('connectionfailed'))

  await page.goto('/')
  await page.getByRole('button', { name: 'OK (200)', exact: true }).click()

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window.__signals ?? []).some((s) => (s as { kind?: string }).kind === 'error'),
      ),
    )
    .toBe(true)

  // The inspector's last signal is that error, not the request span.
  await expect(page.locator('.inspector')).toHaveAttribute('data-kind', 'error')
})
