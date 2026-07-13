import { test, expect } from '@playwright/test'

test('each error button records a typed error signal on the current trace', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'RangeError', exact: true }).click()

  const last = await page.evaluate(() => (window.__signals ?? []).at(-1))
  expect(last).toMatchObject({ kind: 'error', errorType: 'RangeError' })

  await expect(page.locator('.inspector')).toContainText('RangeError')

  // the error deep-links to its span, not just the trace
  const rec = last as { spanId?: string; traceId?: string }
  expect(rec.spanId).toMatch(/^[0-9a-f]{16}$/)
  await expect(page.locator('.inspector a.inspector__link')).toHaveAttribute(
    'href',
    new RegExp(`/traces/${rec.traceId}/${rec.spanId}$`),
  )
})
