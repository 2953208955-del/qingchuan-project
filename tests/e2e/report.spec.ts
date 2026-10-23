import { test, expect } from '@playwright/test'

// Uses the deterministic fixture written by tests/e2e/seed-e2e.ts: the report
// row is `needs_review` and one detection is a pending 0.42 finding, so the
// export gate must stay closed until that finding is reviewed.
test('reviews the low-confidence finding and regenerates an exportable report', async ({ page }) => {
  await page.goto('/reports')
  const entry = page.getByRole('link', { name: /E2E 验收报告/ })
  await expect(entry).toBeVisible()
  await entry.click()

  await expect(page.getByRole('heading', { level: 1, name: 'E2E 验收报告' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /本次巡检发现 2 个垃圾目标/ })).toBeVisible()

  const appendix = page.getByRole('region', { name: '证据附录' })
  await expect(appendix.locator('[data-detection-id="e2e-d1"]')).toBeVisible()

  await expect(page.getByRole('button', { name: '导出 PDF' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '还需复核 1 项' })).toBeDisabled()

  // The print route is the "save as PDF" path: it must not render the body.
  await page.goto('/reports/e2e-run-1/print')
  await expect(page.getByRole('heading', { name: '报告暂不可导出' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'E2E 验收报告' })).toHaveCount(0)
  await expect(page.getByText(/本次巡检发现/)).toHaveCount(0)

  // Real review write against the dev-server DB; the review marks the report
  // stale, which is exactly the state regeneration is meant to resolve.
  await page.goto('/reports/e2e-run-1')
  const patch = await page.request.patch('/api/detections/e2e-d2', {
    data: { reviewStatus: 'confirmed', runId: 'e2e-run-1', imageId: 'e2e-img-1' },
  })
  expect(patch.ok()).toBeTruthy()
  await page.reload()

  await expect(page.getByRole('button', { name: '导出 PDF' })).toBeDisabled()
  const regenerate = page.getByRole('button', { name: '重新生成报告' })
  await expect(regenerate).toBeEnabled()

  // Keep AI offline: only the regenerate POST is mocked.
  await page.route('**/api/runs/e2e-run-1/report', route => {
    if (route.request().method() !== 'POST') return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        report: { id: 'e2e-report-2', runId: 'e2e-run-1', version: 2, status: 'draft' },
        runStatus: 'completed',
      }),
    })
  })

  await regenerate.click()
  await expect(page.getByText('报告已重新生成。')).toBeVisible()
})

test('does not render the report body on the print route while blocked', async ({ page }) => {
  await page.goto('/reports/e2e-run-1/print')

  await expect(page.getByRole('heading', { level: 1, name: '报告暂不可导出' })).toBeVisible()
  await expect(page.getByRole('region', { name: '证据附录' })).toHaveCount(0)
  await expect(page.getByText('E2E 种子数据，仅用于验收流程，不代表真实评测结果。')).toHaveCount(0)
})
