import { test, expect } from '@playwright/test'

// The failure warning must survive later sends: every envelope emits 'sending'
// before it settles, and hiding the warning during that window makes it blink out
// on each action even though delivery is still broken.
test('the unreachable-host warning stays up while the next envelope is sending', async ({ page }) => {
  // Every envelope fails, but only after a delay, so the 'sending' window is wide
  // enough to observe rather than a race.
  await page.route('**/envelope/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    await route.abort('connectionrefused')
  })

  await page.goto('/')

  // The pageload envelope fails: the warning appears, naming the host it tried (the
  // DSN host is the usual thing to get wrong), which playwright.config.ts sets.
  const warning = page.locator('.delivery')
  await expect(warning).toBeVisible({ timeout: 15_000 })
  await expect(warning).toContainText("Can't reach Uptrace at 127.0.0.1:14318")

  // Fire another signal and catch the app mid-send, before its envelope settles.
  await Promise.all([
    page.waitForRequest('**/envelope/**'),
    page.getByRole('button', { name: 'RangeError', exact: true }).click(),
  ])

  // Delivery is still broken, so the warning must stay on screen for the whole
  // send. Sampled continuously, not with a retrying assertion: toBeVisible() would
  // simply wait out the blink and see the warning come back when the send fails.
  const blinked = await page.evaluate(async () => {
    const deadline = Date.now() + 800
    while (Date.now() < deadline) {
      if (!document.querySelector('.delivery')) return true
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return false
  })
  expect(blinked).toBe(false)
  await expect(warning).toContainText("Can't reach Uptrace")
})
