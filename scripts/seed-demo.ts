import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '../src/lib/db/client'
import { detections, images, reports, runs } from '../src/lib/db/schema'
import { buildDemoReport } from '../src/lib/demo/demo-report'

const DEMO_RUN_ID = 'demo-run-001'
const DEMO_IMAGES = ['demo-img-1', 'demo-img-2', 'demo-img-3'] as const
const SAMPLE_FILES = ['sample-1.jpg', 'sample-2.jpg', 'sample-3.jpg'] as const
const SAMPLES_DIR = path.resolve('public/samples')
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')

interface Sample {
  filename: string
  buffer: Buffer
  sha256: string
}

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function readSamples(): Sample[] {
  const missing: string[] = []
  for (const filename of SAMPLE_FILES) {
    const full = path.join(SAMPLES_DIR, filename)
    let usable = false
    try {
      const stat = fs.statSync(full)
      usable = stat.isFile() && stat.size > 0
    } catch {
      usable = false
    }
    if (!usable) missing.push(full)
  }

  if (missing.length > 0) {
    fail([
      '缺少演示样例图，未写入任何演示数据：',
      ...missing.map(file => `  - ${file}`),
      '',
      '请先把 3 张真实巡检照片放到 public/samples/，文件名必须为：',
      '  sample-1.jpg、sample-2.jpg、sample-3.jpg',
      '图片内容、来源/许可证登记与隐私要求见 public/samples/README.md。',
      '补齐后重新运行 npm run seed。',
    ].join('\n'))
  }

  return SAMPLE_FILES.map(filename => {
    const buffer = fs.readFileSync(path.join(SAMPLES_DIR, filename))
    return { filename, buffer, sha256: sha256(buffer) }
  })
}

// 演示文件使用稳定名 demo-sample-N.jpg。若用户已上传同名文件：
// - 内容相同则复用；
// - 内容不同则改用带内容哈希的文件名，绝不覆盖用户文件。
function storeDemoUpload(sample: Sample, index: number, createdFiles: string[]): string {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  const ext = path.extname(sample.filename) || '.jpg'
  const base = `demo-sample-${index + 1}`
  const shortHash = sample.sha256.slice(0, 12)
  const names = [`${base}${ext}`, `${base}-${shortHash}${ext}`]
  for (let n = 2; n <= 20; n++) names.push(`${base}-${shortHash}-${n}${ext}`)

  for (const name of names) {
    const target = path.join(UPLOADS_DIR, name)
    let existing: Buffer | null = null
    try {
      existing = fs.readFileSync(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    if (existing !== null) {
      if (sha256(existing) === sample.sha256) return target
      continue
    }

    try {
      fs.writeFileSync(target, sample.buffer, { flag: 'wx' })
      createdFiles.push(target)
      return target
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
  }

  throw new Error(`无法在 ${UPLOADS_DIR} 中为 ${sample.filename} 找到不冲突的演示文件名`)
}

function removeCreatedFiles(createdFiles: string[]): void {
  for (const file of createdFiles) {
    try {
      fs.rmSync(file, { force: true })
    } catch {
      // 清理尽力而为，不掩盖原始错误。
    }
  }
}

function main(): void {
  const samples = readSamples()
  const db = getDb()

  let existing: typeof runs.$inferSelect | undefined
  try {
    existing = db.select().from(runs).where(eq(runs.id, DEMO_RUN_ID)).get()
  } catch (error) {
    fail(
      `数据库尚未初始化：${error instanceof Error ? error.message : String(error)}\n` +
        '请先运行 npm run db:push 创建数据表，再运行 npm run seed。',
    )
  }

  if (existing) {
    console.log('演示数据已存在，跳过')
    return
  }

  const { detections: demoDetections, report } = buildDemoReport()
  const createdFiles: string[] = []

  try {
    const stored = samples.map((sample, index) => ({
      ...sample,
      uploadPath: storeDemoUpload(sample, index, createdFiles),
    }))

    const now = Date.now()
    const demoImages = stored.map((sample, index) => ({
      id: DEMO_IMAGES[index],
      runId: DEMO_RUN_ID,
      filename: sample.filename,
      path: path.resolve(sample.uploadPath),
      sha256: sample.sha256,
      status: 'analyzed',
      width: null,
      height: null,
      exifJson: null,
      hint: null,
    }))
    const detectionRows = demoDetections.map(detection => ({
      id: detection.id,
      runId: DEMO_RUN_ID,
      imageId: detection.imageId,
      category: detection.category,
      material: detection.material,
      confidence: detection.confidence,
      bboxJson: detection.bbox ? JSON.stringify(detection.bbox) : null,
      description: detection.description,
      source: detection.source,
      reviewStatus: detection.reviewStatus,
      createdAt: now,
    }))

    db.transaction(tx => {
      tx.insert(runs).values({
        id: DEMO_RUN_ID,
        status: 'awaiting_review',
        instruction: '检查河岸塑料垃圾并生成报告',
        location: '示例河段 A 段',
        focusCategories: '[]',
        totalCostCny: 0.12,
        createdAt: now,
        updatedAt: now,
      }).run()

      tx.insert(images).values(demoImages).run()
      tx.insert(detections).values(detectionRows).run()
      tx.insert(reports).values({
        id: 'demo-report-001',
        runId: DEMO_RUN_ID,
        version: 1,
        contentJson: JSON.stringify(report),
        // 两个低置信目标待复核，报告与任务状态保持一致。
        status: 'needs_review',
        createdAt: now,
      }).run()
    })
  } catch (error) {
    removeCreatedFiles(createdFiles)
    fail(
      `演示数据写入失败，已回滚并清理本次复制的图片：${error instanceof Error ? error.message : String(error)}`,
    )
  }

  console.log('演示数据已写入：')
  console.log(`  任务 ${DEMO_RUN_ID}（awaiting_review，2 个低置信目标待复核）`)
  console.log(`  图片 ${samples.length} 张，已复制到 ${UPLOADS_DIR}`)
  console.log(`  识别 ${demoDetections.length} 个目标，报告 demo-report-001（needs_review）`)
  console.log('  报告为人工构造示例（source: manual），不是实时 AI 输出或评测结果。')
  console.log('打开 http://localhost:3000/reports 查看。')
}

try {
  main()
} catch (error) {
  fail(`演示数据写入失败：${error instanceof Error ? error.message : String(error)}`)
}
