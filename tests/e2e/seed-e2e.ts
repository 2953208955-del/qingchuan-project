// Deterministic E2E fixture: one run whose report still needs review. The
// report page, the report library and the export gate all read this data.
//
// Run through tsx (`npx tsx tests/e2e/seed-e2e.ts`) so the `@/` aliases resolve.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import { detections, images, reports, runs } from '@/lib/db/schema'
import type { ReportDraft } from '@/lib/domain/schemas'

const RUN_ID = 'e2e-run-1'
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './.playwright/data')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nN0AAAAASUVORK5CYII=',
  'base64',
)
const SHA256 = crypto.createHash('sha256').update(PNG).digest('hex')

const report: ReportDraft = {
  title: 'E2E 验收报告',
  location: '清川测试河段',
  inspectedAt: '2026-10-22T00:00:00.000Z',
  claims: [
    {
      id: 'e2e-c1',
      section: 'summary',
      text: '本次巡检发现 2 个垃圾目标，其中 1 个低置信目标待人工复核。',
      evidenceIds: ['detection:e2e-d1', 'detection:e2e-d2'],
    },
    {
      id: 'e2e-c2',
      section: 'findings',
      text: '发现塑料瓶 1 个、疑似塑料袋 1 个。',
      evidenceIds: ['detection:e2e-d1', 'detection:e2e-d2'],
    },
    {
      id: 'e2e-c3',
      section: 'recommendations',
      text: '建议人工复核疑似塑料袋后清理该河段。',
      evidenceIds: ['detection:e2e-d2'],
    },
  ],
  metrics: {
    imageCount: 1,
    detectionCount: 2,
    weightedTotal: 2.4,
    intensity: 2.4,
    severity: 'medium',
    formulaVersion: 'severity-v1',
  },
  citations: [],
  modelInfo: { textModel: 'deepseek-chat', visionModel: 'qwen3-vl-plus', promptVersion: 'reporter-v1' },
  limitations: ['E2E 种子数据，仅用于验收流程，不代表真实评测结果。'],
}

function main(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  const imagePath = path.join(UPLOADS_DIR, 'e2e.png')
  fs.writeFileSync(imagePath, PNG)

  const db = createDb(path.join(DATA_DIR, 'qingchuan.db'))
  migrate(db, { migrationsFolder: path.resolve('drizzle') })

  const now = Date.now()
  db.transaction(tx => {
    // Re-running the seed must not duplicate the fixture.
    tx.delete(reports).where(eq(reports.runId, RUN_ID)).run()
    tx.delete(detections).where(eq(detections.runId, RUN_ID)).run()
    tx.delete(images).where(eq(images.runId, RUN_ID)).run()
    tx.delete(runs).where(eq(runs.id, RUN_ID)).run()

    tx.insert(runs).values({
      id: RUN_ID,
      status: 'awaiting_review',
      instruction: '检查河岸塑料垃圾并生成报告',
      location: '清川测试河段',
      focusCategories: '[]',
      totalCostCny: 0.02,
      createdAt: now,
      updatedAt: now,
    }).run()

    tx.insert(images).values({
      id: 'e2e-img-1',
      runId: RUN_ID,
      filename: 'e2e.png',
      path: imagePath,
      sha256: SHA256,
      width: 1,
      height: 1,
      exifJson: null,
      status: 'analyzed',
      hint: null,
    }).run()

    tx.insert(detections).values([
      {
        id: 'e2e-d1',
        runId: RUN_ID,
        imageId: 'e2e-img-1',
        category: 'plastic_bottle',
        material: 'PET',
        confidence: 0.92,
        bboxJson: JSON.stringify({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
        description: '塑料瓶',
        source: 'vlm',
        reviewStatus: 'confirmed',
        createdAt: now,
      },
      {
        id: 'e2e-d2',
        runId: RUN_ID,
        imageId: 'e2e-img-1',
        category: 'plastic_bag',
        material: 'PE',
        confidence: 0.42,
        bboxJson: JSON.stringify({ x: 0.5, y: 0.5, w: 0.2, h: 0.15 }),
        description: '疑似塑料袋',
        source: 'vlm',
        reviewStatus: 'pending',
        createdAt: now,
      },
    ]).run()

    tx.insert(reports).values({
      id: 'e2e-report-1',
      runId: RUN_ID,
      version: 1,
      contentJson: JSON.stringify(report),
      status: 'needs_review',
      createdAt: now,
    }).run()
  })

  console.log(`E2E fixture ready: ${RUN_ID} in ${DATA_DIR}`)
}

main()
