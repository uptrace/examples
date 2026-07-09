import { test, expect } from '@playwright/test'

test('OK request records an http signal with status 200', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'OK (200)' }).click()

  const rec = await page.waitForFunction(() =>
    (window.__signals ?? []).find(
      (s): s is { kind: string; label: string; detail: string } =>
        (s as { kind?: string }).kind === 'http' && (s as { label?: string }).label === 'GET /api/ok',
    ),
  )
  expect(await rec.jsonValue()).toMatchObject({ label: 'GET /api/ok', detail: 'HTTP 200' })
})

test('slow request records a long http span', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Slow (~5s)' }).click()

  const rec = await page.waitForFunction(
    () =>
      (window.__signals ?? []).find(
        (s): s is { kind: string; label: string; durationMs: number } =>
          (s as { kind?: string }).kind === 'http' && (s as { label?: string }).label === 'GET /api/slow',
      ),
    null,
    { timeout: 15_000 },
  )
  expect((await rec.jsonValue()).durationMs).toBeGreaterThan(4500)
})

test('failed request also records an error signal', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Fail (500)' }).click()

  const rec = await page.waitForFunction(() =>
    (window.__signals ?? []).find(
      (s): s is { kind: string; label: string } => (s as { kind?: string }).kind === 'error',
    ),
  )
  expect((await rec.jsonValue()).label).toContain('/api/fail')
})
