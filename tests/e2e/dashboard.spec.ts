import { expect, test } from '@playwright/test'

test('home renders the live-data holographic command screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /全域巡检态势/ })).toBeVisible()
  await expect(page.getByText('巡检影像回放 · 非实时')).toBeVisible()
  await expect(page.getByText(/河道与点位为示意/)).toBeVisible()

  const points = page.locator('[data-map-point]')
  await expect(points).toHaveCount(2)
  await points.first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: '查看完整报告' })).toHaveAttribute('href', '/reports/e2e-run-1')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await expect(page.locator('[data-kpi="detections"]')).toContainText('2')
  await expect(page.locator('[data-kpi="pending"]')).toContainText('1')
  await expect(page.getByText(/累计任务 1 · 报告 1 · 标准条款 0/)).toBeVisible()
})
