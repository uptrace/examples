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

test('a span record carries a span id and the inspector deep-links to it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Span name').fill('linkable')
  await page.getByRole('button', { name: 'Start span' }).click()
  await page.getByRole('button', { name: 'Stop span' }).click()

  const rec = (await page.evaluate(() => (window.__signals ?? []).at(-1))) as {
    kind: string
    spanId?: string
    traceId?: string
  }
  expect(rec.kind).toBe('span')
  expect(rec.spanId).toMatch(/^[0-9a-f]{16}$/)

  // .env sets VITE_UPTRACE_URL + a DSN, so the inspector renders a deep link
  // whose href adds the span id as a path segment (/traces/<traceId>/<spanId>),
  // the form the Uptrace explore UI honors.
  const link = page.locator('.inspector a.inspector__link')
  await expect(link).toHaveAttribute(
    'href',
    new RegExp(`/traces/${rec.traceId}/${rec.spanId}$`),
  )
})
