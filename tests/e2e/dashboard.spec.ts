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
  await expect(points.first()).toBeFocused()

  await expect(page.locator('[data-kpi="detections"]')).toContainText('2')
  await expect(page.locator('[data-kpi="pending"]')).toContainText('1')
  await expect(page.getByText(/累计任务 1 · 报告 1 · 标准条款 0/)).toBeVisible()
})

test('fits the 1920x1080 command screen without page scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /全域巡检态势/ })).toBeVisible()

  const viewport = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }))
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.innerHeight)
})

test('stays within the 390x844 viewport with a long free-text location', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /全域巡检态势/ })).toBeVisible()

  // Simulate a user-entered, unbroken location without changing the fixture DB.
  await page.locator('.river-map .holo-panel__actions .holo-badge').evaluate(badge => {
    const target = badge.querySelector('span') ?? badge
    const longLocation = 'QINGCHUAN-RIVER-'.repeat(24)
    target.textContent = longLocation
    badge.setAttribute('title', longLocation)
  })

  const viewport = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth)
})
