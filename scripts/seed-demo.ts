import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '../src/lib/db/client'
import { detections, images, reports, runs } from '../src/lib/db/schema'
import { buildEvidenceIndex, verifyReport } from '../src/lib/domain/evidence'
import { computeSeverity } from '../src/lib/domain/severity'
import type { Detection, ReportDraft } from '../src/lib/domain/schemas'

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

function buildDemoData() {
  const demoDetections: Detection[] = [
    { id: 'demo-d1', imageId: 'demo-img-1', category: 'plastic_bottle', material: 'PET', confidence: 0.92, bbox: { x: 0.12, y: 0.2, w: 0.08, h: 0.16 }, description: '透明塑料瓶', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d2', imageId: 'demo-img-1', category: 'plastic_bag', material: 'PE', confidence: 0.88, bbox: { x: 0.4, y: 0.3, w: 0.14, h: 0.12 }, description: '白色塑料袋', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d3', imageId: 'demo-img-1', category: 'plastic_bottle', material: 'PET', confidence: 0.86, bbox: { x: 0.7, y: 0.55, w: 0.07, h: 0.14 }, description: '饮料瓶', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d4', imageId: 'demo-img-2', category: 'fishing_gear', material: '尼龙', confidence: 0.79, bbox: { x: 0.2, y: 0.4, w: 0.2, h: 0.1 }, description: '废弃渔网', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d5', imageId: 'demo-img-2', category: 'plastic_bag', material: 'PE', confidence: 0.45, bbox: { x: 0.5, y: 0.2, w: 0.12, h: 0.1 }, description: '疑似包装袋', source: 'vlm', reviewStatus: 'pending' },
    { id: 'demo-d6', imageId: 'demo-img-2', category: 'glass', material: '玻璃', confidence: 0.83, bbox: { x: 0.75, y: 0.6, w: 0.06, h: 0.12 }, description: '玻璃瓶', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d7', imageId: 'demo-img-3', category: 'foam', material: 'EPS', confidence: 0.91, bbox: { x: 0.3, y: 0.5, w: 0.1, h: 0.08 }, description: '泡沫碎块', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d8', imageId: 'demo-img-3', category: 'plastic_bottle', material: 'PET', confidence: 0.38, bbox: { x: 0.6, y: 0.3, w: 0.07, h: 0.14 }, description: '疑似塑料瓶', source: 'vlm', reviewStatus: 'pending' },
  ]

  // 演示数字必须由与生产相同的严重度公式算出，且与固定的示例值一致。
  const severity = computeSeverity(demoDetections, SAMPLE_FILES.length)
  if (severity.weightedTotal !== 9.8 || severity.intensity !== 3.27 || severity.overall !== 'medium') {
    fail(
      '演示识别结果与严重度公式不一致，未写入任何数据：' +
        `weightedTotal=${severity.weightedTotal}, intensity=${severity.intensity}, severity=${severity.overall}。` +
        '请检查 src/lib/domain/severity.ts 或演示识别结果。',
    )
  }

  const metrics: ReportDraft['metrics'] = {
    imageCount: SAMPLE_FILES.length,
    detectionCount: demoDetections.length,
    weightedTotal: severity.weightedTotal,
    intensity: severity.intensity,
    severity: severity.overall,
    formulaVersion: severity.formulaVersion,
  }

  const report: ReportDraft = {
    title: '示例河段 A 段巡检报告',
    location: '示例河段 A 段',
    inspectedAt: new Date().toISOString(),
    claims: [
      { id: 'demo-c1', section: 'summary', text: '本次共分析 3 张图片，识别到 8 个垃圾目标，以塑料类为主。', evidenceIds: ['metric:overall'] },
      { id: 'demo-c2', section: 'findings', text: '发现塑料瓶 3 个、塑料袋 2 个、泡沫塑料 1 个、渔网渔具 1 处、玻璃 1 个。', evidenceIds: ['detection:demo-d1', 'detection:demo-d2', 'detection:demo-d4'] },
      { id: 'demo-c3', section: 'severity', text: '加权检出强度为 3.27，整体严重度为中；渔网渔具与玻璃需优先处理。', evidenceIds: ['metric:overall', 'detection:demo-d4', 'detection:demo-d6'] },
      { id: 'demo-c4', section: 'recommendations', text: '建议优先清理渔网渔具与玻璃，塑料类安排人工打捞。', evidenceIds: ['detection:demo-d4', 'detection:demo-d6'] },
      { id: 'demo-c5', section: 'limitations', text: '未做面积标定，检出强度仅按图片数量计算；2 个低置信目标待人工复核。', evidenceIds: ['detection:demo-d5', 'detection:demo-d8'] },
    ],
    metrics,
    citations: [],
    modelInfo: { textModel: 'deepseek-chat', visionModel: 'qwen2.5-vl-max-latest', promptVersion: 'reporter-v1' },
    limitations: ['未做面积标定', '2 个低置信目标待人工复核'],
  }

  // 用生产 Verifier 自检报告：证据 ID 必须存在、数字必须与识别结果一致。
  const index = buildEvidenceIndex({ detections: demoDetections, clauses: [], metrics })
  const verification = verifyReport(report, index)
  if (!verification.passed) {
    fail(
      '演示报告自检未通过，未写入任何数据：\n' +
        verification.issues.map(issue => `  - ${issue.claimId ?? ''} ${issue.message}`).join('\n'),
    )
  }

  return { demoDetections, report }
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

  const { demoDetections, report } = buildDemoData()
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
  console.log('打开 http://localhost:3000/reports 查看。')
}

try {
  main()
} catch (error) {
  fail(`演示数据写入失败：${error instanceof Error ? error.message : String(error)}`)
}
