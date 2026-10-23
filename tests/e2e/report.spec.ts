import { test, expect } from '@playwright/test'

// Uses the deterministic fixture written by tests/e2e/seed-e2e.ts: the report
// row is `needs_review` and one detection is a pending 0.42 finding, so the
// export gate must stay closed.
test('shows the seeded report and blocks export until review', async ({ page }) => {
  await page.goto('/reports')
  const entry = page.getByRole('link', { name: /E2E 验收报告/ })
  await expect(entry).toBeVisible()
  await entry.click()

  await expect(page.getByRole('heading', { level: 1, name: 'E2E 验收报告' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /本次巡检发现 2 个垃圾目标/ })).toBeVisible()

  const appendix = page.getByRole('region', { name: '证据附录' })
  await expect(appendix.locator('[data-detection-id="e2e-d1"]')).toBeVisible()

  await expect(page.getByRole('button', { name: '导出 PDF' })).toBeDisabled()
})

test('renders the print route for the seeded report', async ({ page }) => {
  await page.goto('/reports/e2e-run-1/print')

  await expect(page.getByRole('heading', { level: 1, name: 'E2E 验收报告' })).toBeVisible()
  await expect(page.getByRole('region', { name: '证据附录' })).toBeVisible()
  await expect(page.getByText('E2E 种子数据，仅用于验收流程，不代表真实评测结果。')).toBeVisible()
})
