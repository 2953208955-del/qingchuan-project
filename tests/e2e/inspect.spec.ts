import { test, expect } from '@playwright/test'

// Fully mocked journey: no request leaves the app, and every payload mirrors
// the DB row shapes the real API returns (images + bboxJson detections).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nN0AAAAASUVORK5CYII='

const report = {
  title: 'E2E 巡检报告',
  location: null,
  inspectedAt: '2026-10-22T00:00:00.000Z',
  claims: [{ id: 'c1', section: 'summary', text: '发现 1 个塑料瓶', evidenceIds: ['detection:d1'] }],
  metrics: {
    imageCount: 1,
    detectionCount: 1,
    weightedTotal: 1.2,
    intensity: 1.2,
    severity: 'low',
    formulaVersion: 'severity-v1',
  },
  citations: [],
  modelInfo: { textModel: 'deepseek-chat', visionModel: 'm', promptVersion: 'reporter-v1' },
  limitations: [],
}

const detail = {
  run: { id: 'run-1', status: 'completed', instruction: '检查塑料垃圾', location: null },
  images: [{
    id: 'i1',
    runId: 'run-1',
    filename: 'a.png',
    path: 'data/uploads/a.png',
    sha256: 'abc',
    status: 'analyzed',
    hint: null,
    width: 1,
    height: 1,
    exifJson: null,
  }],
  detections: [{
    id: 'd1',
    runId: 'run-1',
    imageId: 'i1',
    category: 'plastic_bottle',
    material: 'PET',
    confidence: 0.9,
    bboxJson: JSON.stringify({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
    description: '塑料瓶',
    source: 'vlm',
    reviewStatus: 'confirmed',
    createdAt: 1_700_000_000_000,
  }],
}

const planPayload = {
  imageCount: 1,
  focusCategories: ['plastic_bottle'],
  intentSummary: '检查塑料垃圾',
  steps: [
    { key: 'analyze', title: '识别图片', detail: '分析 1 张图片，重点关注塑料瓶；其他类别仍会记录' },
    { key: 'aggregate', title: '汇总与严重度', detail: '按代码公式汇总加权检出量、检出强度与严重度' },
    { key: 'retrieve', title: '检索标准条款', detail: '检索清川 SOP 条款，并绑定到结论证据' },
    { key: 'draft', title: '起草报告', detail: '由文本模型起草结论；每条结论必须绑定证据' },
    { key: 'verify', title: '校验与复核', detail: '校验数字、证据与引用；低置信目标进入人工复核' },
  ],
  tools: ['create_work_order'],
  parsedBy: 'llm',
  estimatedSeconds: 5,
  estimatedCostCny: 0.02,
  output: 'inspection_report',
}

const sse = [
  'event: step',
  'data: {"type":"step","runId":"run-1","step":{"id":"s1","step":"analyze_image","status":"done","toolName":"analyzeImage","detail":"1 个目标","latencyMs":12,"costCny":0}}',
  '',
  'event: done',
  'data: {"type":"done","runId":"run-1","status":"completed"}',
  '',
  '',
].join('\n')

test('runs a mocked inspection and links evidence', async ({ page }) => {
  await page.route('**/api/uploads', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ filename: 'a.png', path: 'data/uploads/a.png', sha256: 'abc' }),
  }))
  await page.route('**/api/runs', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'run-1', instruction: '检查塑料垃圾', location: null }),
  }))
  await page.route('**/api/runs/run-1/plan', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(planPayload),
  }))
  await page.route('**/api/runs/run-1/analyze', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: sse,
  }))
  await page.route('**/api/runs/run-1/report', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ contentJson: JSON.stringify(report) }),
  }))
  await page.route('**/api/runs/run-1', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(detail),
  }))
  await page.route('**/api/knowledge/search', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ clauses: [], noEvidence: true }),
  }))
  // The evidence canvas needs a real image for the overlay to have a box.
  await page.route('**/api/images/i1', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from(PNG_BASE64, 'base64'),
  }))

  await page.goto('/inspect')
  await page.getByRole('textbox', { name: '巡检指令' }).fill('检查塑料垃圾')
  await page.setInputFiles('input[type=file]', {
    name: 'a.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  })
  await expect(page.getByText('已选 1/20 张')).toBeVisible()

  await page.getByRole('button', { name: '生成计划' }).click()
  const planDialog = page.getByRole('dialog', { name: '执行计划确认' })
  await expect(planDialog).toBeVisible()
  await expect(planDialog).toContainText('任务理解：检查塑料垃圾')
  await expect(planDialog).toContainText('汇总与严重度')
  await expect(planDialog).toContainText('其他类别仍会识别并保留')
  await expect(planDialog).toContainText('额外工具：整改工单')
  await expect(page.getByRole('button', { name: '计划已生成' })).toBeDisabled()
  await page.getByRole('button', { name: '开始巡检（确认执行计划）' }).click()

  await expect(page.getByRole('region', { name: 'Agent 执行时间线' }).getByText('analyze_image')).toBeVisible()
  await expect(page.getByRole('region', { name: '识别结果' })).toContainText('塑料瓶')
  await expect(page.locator('[data-detection-id="d1"]')).toBeVisible()

  await expect(page.getByText('运行状态：')).toContainText('分析完成')
  await expect(page.getByRole('link', { name: '查看报告' })).toHaveAttribute('href', '/reports/run-1')

  // A finished run must offer a reset without a page reload. The store and the
  // page-level start/finish flags all clear, restoring the task/plan panels.
  await page.getByRole('button', { name: '新一轮巡检' }).click()
  await expect(page.getByRole('button', { name: '生成计划' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '巡检指令' })).toHaveValue('')
  await expect(page.getByText('已选 0/20 张')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Agent 执行时间线' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新一轮巡检' })).toHaveCount(0)
  // Reset must land the user back in the task form, not on <body>.
  await expect(page.getByRole('textbox', { name: '巡检指令' })).toBeFocused()
})

test('offers the reset after a stream dies mid-run and focuses the instruction', async ({ page }) => {
  const steppedOnly = [
    'event: step',
    'data: {"type":"step","runId":"run-1","step":{"id":"s1","step":"analyze_image","status":"done","toolName":"analyzeImage","detail":"1 个目标","latencyMs":12,"costCny":0}}',
    '',
    '',
  ].join('\n')

  await page.route('**/api/uploads', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ filename: 'a.png', path: 'data/uploads/a.png', sha256: 'abc' }),
  }))
  await page.route('**/api/runs', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'run-1', instruction: '检查塑料垃圾', location: null }),
  }))
  await page.route('**/api/runs/run-1/plan', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(planPayload),
  }))
  await page.route('**/api/runs/run-1/analyze', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: steppedOnly,
  }))
  await page.route('**/api/knowledge/search', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ clauses: [], noEvidence: true }),
  }))

  await page.goto('/inspect')
  await page.getByRole('textbox', { name: '巡检指令' }).fill('检查塑料垃圾')
  await page.setInputFiles('input[type=file]', {
    name: 'a.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  })
  await expect(page.getByText('已选 1/20 张')).toBeVisible()
  await page.getByRole('button', { name: '生成计划' }).click()
  await expect(page.getByRole('dialog', { name: '执行计划确认' })).toBeVisible()
  await page.getByRole('button', { name: '开始巡检（确认执行计划）' }).click()

  // The step streamed, so the run is no longer startable; without a reset the
  // user would still be stranded on the partial results view.
  await expect(page.locator('.inspect-alert')).toContainText('分析连接意外中断')
  await expect(page.getByText('本轮巡检已中断，可开始新一轮巡检后重试。')).toBeVisible()
  await page.getByRole('button', { name: '新一轮巡检' }).click()

  await expect(page.getByRole('button', { name: '生成计划' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '巡检指令' })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: '巡检指令' })).toBeFocused()
  await expect(page.getByRole('button', { name: '新一轮巡检' })).toHaveCount(0)
})
