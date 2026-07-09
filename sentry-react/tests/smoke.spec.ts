import { test, expect } from '@playwright/test'

test('app boots and mounts into #root', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#root')).toBeVisible()
})
