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

test('an open span is ended if you navigate away before stopping it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Span name').fill('abandoned')
  await page.getByRole('button', { name: 'Start span' }).click()
  // navigate away without clicking Stop -> SpanPanel unmounts
  await page.getByRole('link', { name: 'Item 42' }).click()
  await expect(page).toHaveURL(/\/item\/42$/)
  const rec = await page.waitForFunction(() =>
    (window.__signals ?? []).find(
      (s): s is { kind: string; label: string } =>
        (s as { kind?: string }).kind === 'span' && (s as { label?: string }).label === 'abandoned',
    ),
  )
  expect(await rec.jsonValue()).toMatchObject({ kind: 'span', label: 'abandoned' })
})
