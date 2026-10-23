import fs from 'node:fs'
import path from 'node:path'
import { matchDetections, type DetectionLike } from '../src/lib/eval/metrics'
import { writeResults } from '../src/lib/eval/results'
import { BBox, DebrisCategory } from '../src/lib/domain/schemas'
import { QwenVisionAnalyzer } from '../src/lib/vision/qwen'

type Annotation = { category: DebrisCategory; bbox: { x: number; y: number; w: number; h: number } }
type Fixture = { image: string; gt: Annotation[]; pred?: Annotation[] }

const ROOT = process.cwd()
const FIXTURE_FILE = path.resolve(ROOT, 'tests/eval/detection-fixtures.json')
const MIN_FIXTURES = 3
const IOU_THRESHOLD = 0.5
const DEFAULT_VISION_MODEL = 'qwen2.5-vl-max-latest'

function validateAnnotations(value: unknown, field: string, fixtureIndex: number): Annotation[] {
  if (!Array.isArray(value)) {
    throw new Error(`检测夹具第 ${fixtureIndex + 1} 项的 ${field} 必须是数组`)
  }
  return value.map((entry, annotationIndex) => {
    const record = (entry ?? {}) as Record<string, unknown>
    const category = DebrisCategory.safeParse(record.category)
    if (!category.success) {
      throw new Error(
        `检测夹具第 ${fixtureIndex + 1} 项 ${field}[${annotationIndex}] 的 category 无效：` +
          `${JSON.stringify(record.category)}。允许值：${DebrisCategory.options.join(', ')}`,
      )
    }
    const bbox = BBox.safeParse(record.bbox)
    if (!bbox.success) {
      throw new Error(
        `检测夹具第 ${fixtureIndex + 1} 项 ${field}[${annotationIndex}] 的 bbox 无效：` +
          `${JSON.stringify(record.bbox)}。需为归一化坐标 { x, y, w, h }（0–1，且不越界）`,
      )
    }
    return { category: category.data, bbox: bbox.data }
  })
}

function readFixtures(): Fixture[] {
  if (!fs.existsSync(FIXTURE_FILE)) {
    throw new Error(`找不到检测夹具：${FIXTURE_FILE}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8'))
  } catch (error) {
    throw new Error(`检测夹具不是合法 JSON：${FIXTURE_FILE}（${error instanceof Error ? error.message : String(error)}）`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`检测夹具必须是数组：${FIXTURE_FILE}`)
  }
  if (parsed.length < MIN_FIXTURES) {
    throw new Error(
      `检测夹具只有 ${parsed.length} 张图，至少需要 ${MIN_FIXTURES} 张真实的带标注样本图` +
        `（建议按 tests/eval/README.md 准备 10 张以上）。` +
        `请在 ${FIXTURE_FILE} 中补充真实 GT，不要编造标注或结果。`,
    )
  }

  return parsed.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`检测夹具第 ${index + 1} 项必须是对象`)
    }
    const record = entry as Record<string, unknown>
    if (typeof record.image !== 'string' || record.image.trim() === '') {
      throw new Error(`检测夹具第 ${index + 1} 项的 image 必须是非空字符串`)
    }
    return {
      image: record.image.trim(),
      gt: validateAnnotations(record.gt, 'gt', index),
      pred: record.pred === undefined ? undefined : validateAnnotations(record.pred, 'pred', index),
    }
  })
}

// Fixtures may name a bare file under public/samples or a repo-relative path.
// Resolve once so every check and the analyzer see the same absolute path.
function resolveSamplePath(image: string): string {
  if (path.isAbsolute(image)) return image
  if (image.startsWith('public/') || image.startsWith('public\\')) return path.resolve(ROOT, image)
  return path.resolve(ROOT, 'public/samples', image)
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const fixtures = readFixtures()

  const samples = fixtures.map(fixture => {
    const samplePath = resolveSamplePath(fixture.image)
    if (!fs.existsSync(samplePath)) {
      throw new Error(
        `夹具引用的样本图不存在：${fixture.image}（解析为 ${samplePath}）。` +
          `请把真实图片放到 public/samples/ 或修正夹具路径。`,
      )
    }
    return samplePath
  })

  let apiKey = ''
  if (!dryRun) {
    apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? ''
    if (!apiKey) {
      throw new Error(
        '缺少 DASHSCOPE_API_KEY，无法运行真实检测评测。请先配置密钥；' +
          '只验证匹配管线可加 --dry-run（dry-run 结果不是效果证据）。',
      )
    }
  }

  const analyzer = dryRun
    ? null
    : new QwenVisionAnalyzer({
        apiKey,
        model: process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL,
      })

  let tp = 0
  let fp = 0
  let fn = 0
  for (const [index, fixture] of fixtures.entries()) {
    const gt: DetectionLike[] = fixture.gt.map((annotation, annotationIndex) => ({
      id: `g${index}-${annotationIndex}`,
      imageId: fixture.image,
      category: annotation.category,
      bbox: annotation.bbox,
    }))

    let predicted: { category: DebrisCategory; bbox: { x: number; y: number; w: number; h: number } }[]
    if (dryRun) {
      predicted = fixture.pred ?? []
    } else {
      const result = await analyzer!.analyze({ imagePath: samples[index] })
      // An abstained response (bad key, HTTP error, unparseable output) is not
      // a detection result. Scoring it as "found nothing" would publish an API
      // outage as model performance, so refuse to write any result.
      if (result.abstained) {
        throw new Error(
          `第 ${index + 1} 张图（${fixture.image}）无法判定：${result.reason ?? '模型未返回可解析结果'}。` +
            '本次评测未写入结果，请检查密钥、模型配置与网络后重试。',
        )
      }
      predicted = result.detections
        .filter(detection => detection.bbox !== null)
        .map(detection => ({ category: detection.category, bbox: detection.bbox! }))
    }

    const pred: DetectionLike[] = predicted.map((annotation, annotationIndex) => ({
      id: `p${index}-${annotationIndex}`,
      imageId: fixture.image,
      category: annotation.category,
      bbox: annotation.bbox,
    }))

    const matched = matchDetections(gt, pred, IOU_THRESHOLD)
    tp += matched.tp
    fp += matched.fp
    fn += matched.fn
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

  const detection = {
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    tp,
    fp,
    fn,
    images: fixtures.length,
    mode: dryRun ? 'dry-run' : 'live',
  }

  writeResults('detection', detection)
  console.log(JSON.stringify({ detection }, null, 2))
}

main().catch(error => {
  console.error(`检测评测失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
