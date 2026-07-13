import { test, expect } from '@playwright/test'

test('adding a todo records a created span; completing it records a completed span with duration', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Todo text').fill('buy milk')
  await page.getByRole('button', { name: 'Add' }).click()

  let last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'span', label: 'created todo: buy milk' })

  // the row deep-links to its created span in Uptrace
  await expect(page.locator('.todo a.todo__link').first()).toHaveAttribute(
    'href',
    /\/traces\/[0-9a-f]{32}\/[0-9a-f]{16}$/,
  )

  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Done' }).click()

  last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'span', label: 'completed todo: buy milk' })
  expect((last as { durationMs?: number }).durationMs).toBeGreaterThan(0)
})

test('a completed todo span carries a span id and the inspector deep-links to it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Todo text').fill('linkable')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  const rec = (await page.evaluate(() => (window.__signals ?? []).at(-1))) as {
    kind: string
    spanId?: string
    traceId?: string
  }
  expect(rec.kind).toBe('span')
  expect(rec.spanId).toMatch(/^[0-9a-f]{16}$/)

  // .env sets VITE_UPTRACE_URL + a DSN, so the inspector renders a deep link whose
  // href adds the span id as a path segment (/traces/<traceId>/<spanId>).
  const link = page.locator('.inspector a.inspector__link')
  await expect(link).toHaveAttribute('href', new RegExp(`/traces/${rec.traceId}/${rec.spanId}$`))
})
