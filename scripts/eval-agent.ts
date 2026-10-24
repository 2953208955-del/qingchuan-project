import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '../src/lib/db/client'
import * as repo from '../src/lib/db/repo'
import { runInspection } from '../src/lib/agent/orchestrator'
import { DeepSeekReportGenerator } from '../src/lib/agent/report-generator'
import { RagRetrievalAdapter } from '../src/lib/agent/retrieval-adapter'
import { QwenVisionAnalyzer } from '../src/lib/vision/qwen'
import { DashScopeEmbedder } from '../src/lib/rag/embed'
import { DashScopeReranker } from '../src/lib/rag/rerank'
import { ingestMarkdown } from '../src/lib/rag/ingest'
import { BudgetTracker } from '../src/lib/ai/budget'
import { verifyReport } from '../src/lib/domain/evidence'
import { DEFAULT_VISION_MODEL, round, writeResults } from '../src/lib/eval/results'

type Scenario = { name: string; instruction: string; expectedStatus: string; image: string }

type ScenarioDetail = {
  name: string
  image: string
  expected: string
  actual: string
  ok: boolean
  latencyMs: number
  minConfidence: number | null
  reportStatus: string | null
  verifyStatus: string | null
  verifyIssues: string[]
  error?: string
}

const ROOT = process.cwd()
const SCENARIO_FILE = path.resolve(ROOT, 'tests/eval/agent-scenarios.json')
const SAMPLES_DIR = path.resolve(ROOT, 'public/samples')
const DEFAULT_IMAGE = 'sample-1.jpg'
const SEED_FILE = path.resolve(ROOT, 'data/knowledge/seed-sop.md')

function readScenarios(): Scenario[] {
  if (!fs.existsSync(SCENARIO_FILE)) {
    throw new Error(`找不到 Agent 评测场景：${SCENARIO_FILE}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(SCENARIO_FILE, 'utf8'))
  } catch (error) {
    throw new Error(
      `Agent 评测场景不是合法 JSON：${SCENARIO_FILE}（${error instanceof Error ? error.message : String(error)}）`,
    )
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Agent 评测场景必须是非空数组：${SCENARIO_FILE}`)
  }

  return parsed.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>
    for (const field of ['name', 'instruction', 'expectedStatus'] as const) {
      if (typeof record[field] !== 'string' || record[field].trim() === '') {
        throw new Error(`Agent 评测场景第 ${index + 1} 项的 ${field} 必须是非空字符串`)
      }
    }
    const image = record.image === undefined ? DEFAULT_IMAGE : record.image
    if (typeof image !== 'string' || image.trim() === '' || image.includes('/') || image.includes('\\')) {
      throw new Error(`Agent 评测场景第 ${index + 1} 项的 image 必须是 public/samples 下的文件名`)
    }
    return {
      name: (record.name as string).trim(),
      instruction: (record.instruction as string).trim(),
      expectedStatus: (record.expectedStatus as string).trim(),
      image: image.trim(),
    }
  })
}

function budgetCapCny(): number {
  const raw = process.env.RUN_BUDGET_CNY
  if (raw === undefined || raw.trim() === '') return 1
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`RUN_BUDGET_CNY 无效：${raw}，应为正数`)
  }
  return value
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    throw new Error(
      'Agent 评测不支持 --dry-run：dry-run 仅用于检测评测的匹配管线验证。' +
        '请直接运行 npm run eval:agent（需要 DASHSCOPE_API_KEY、DEEPSEEK_API_KEY 和 tests/eval 场景指定的样例图）。',
    )
  }

  const dashscopeKey = process.env.DASHSCOPE_API_KEY?.trim() ?? ''
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() ?? ''
  const missing = [
    dashscopeKey ? '' : 'DASHSCOPE_API_KEY',
    deepseekKey ? '' : 'DEEPSEEK_API_KEY',
  ].filter(Boolean)
  if (missing.length > 0) {
    throw new Error(`缺少 ${missing.join(' 和 ')}，无法运行真实 Agent 评测。请配置密钥后重试。`)
  }

  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`缺少种子知识库文件：${SEED_FILE}`)
  }

  const scenarios = readScenarios()
  const capCny = budgetCapCny()
  const images = new Map<string, { path: string; sha256: string }>()
  for (const scenario of scenarios) {
    const imagePath = path.resolve(SAMPLES_DIR, scenario.image)
    if (!imagePath.startsWith(SAMPLES_DIR + path.sep)) {
      throw new Error(`Agent 评测场景 ${scenario.name} 的图片路径非法：${scenario.image}`)
    }
    if (!fs.existsSync(imagePath)) {
      throw new Error(`缺少 Agent 评测样例图：${imagePath}。请放入真实巡检图片后重试。`)
    }
    if (!images.has(scenario.image)) {
      images.set(scenario.image, {
        path: imagePath,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex'),
      })
    }
  }

  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve(ROOT, 'drizzle') })

  // Ingest the seed SOP with the real embedder before the scenarios run, so a
  // report can cite clauses instead of always falling back to "no evidence".
  const embedder = new DashScopeEmbedder(dashscopeKey)
  try {
    await ingestMarkdown(db, embedder, {
      documentId: 'seed-sop',
      standardNo: '清川SOP',
      title: 'seed-sop.md',
      markdown: fs.readFileSync(SEED_FILE, 'utf8'),
    })
  } catch (error) {
    throw new Error(
      `种子知识库入库失败，无法运行 Agent 评测：${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const vision = new QwenVisionAnalyzer({
    apiKey: dashscopeKey,
    model: process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL,
  })
  const retrieval = new RagRetrievalAdapter(db, embedder, new DashScopeReranker(dashscopeKey))

  const details: ScenarioDetail[] = []
  for (const scenario of scenarios) {
    const startedAt = Date.now()
    let actual = 'error'
    let errorMessage: string | undefined
    const stepErrors: string[] = []
    let minConfidence: number | null = null
    let reportStatus: string | null = null
    let verifyStatus: string | null = null
    let verifyIssues: string[] = []

    try {
      const image = images.get(scenario.image)
      if (!image) throw new Error(`场景 ${scenario.name} 缺少图片配置`)
      const run = repo.createRun(db, { instruction: scenario.instruction, location: null })
      repo.addImage(db, {
        id: crypto.randomUUID(),
        runId: run.id,
        filename: scenario.image,
        path: image.path,
        sha256: image.sha256,
        status: 'pending',
      })
      // Per-run budget: each scenario starts from zero, matching a real run.
      // Vision and report drafting charge the same tracker.
      const budget = new BudgetTracker(capCny)
      actual = await runInspection(run.id, {
        db,
        repo,
        vision,
        retrieval,
        reporter: new DeepSeekReportGenerator({ budget }),
        verifier: { verify: verifyReport },
        budget,
        emit: event => {
          const step = event.step
          if (event.type === 'step' && step?.status === 'error') {
            stepErrors.push(step.detail ?? step.step)
          }
        },
        now: () => new Date(),
      })
      const detectionStats = db.$client
        .prepare('select min(confidence) as minConfidence from detections where run_id = ?')
        .get(run.id) as { minConfidence: number | null } | undefined
      minConfidence = detectionStats?.minConfidence ?? null
      const report = db.$client
        .prepare('select status from reports where run_id = ? order by version desc limit 1')
        .get(run.id) as { status: string } | undefined
      reportStatus = report?.status ?? null
      const verify = db.$client
        .prepare("select status, output_json from agent_steps where run_id = ? and step = 'verify' order by started_at desc limit 1")
        .get(run.id) as { status: string; output_json: string | null } | undefined
      verifyStatus = verify?.status ?? null
      if (verify?.output_json) {
        try {
          const parsed = JSON.parse(verify.output_json) as { issues?: { message?: string }[] }
          verifyIssues = (parsed.issues ?? []).map(issue => issue.message ?? JSON.stringify(issue))
        } catch {
          verifyIssues = ['verify output is not valid JSON']
        }
      }
      if (actual === 'failed') {
        const failedRun = repo.getRun(db, run.id)
        const detail = stepErrors.length > 0 ? `（${stepErrors.join('; ')}）` : ''
        errorMessage = `${failedRun?.error ?? '运行失败'}${detail}`
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error)
    }

    // A "failed" scenario only passes when the run rejected the injection, not
    // merely because it failed for some unrelated reason.
    const injectionRejectionOk =
      scenario.expectedStatus !== 'failed' || (errorMessage?.includes('可疑内容') ?? false)
    details.push({
      name: scenario.name,
      image: scenario.image,
      expected: scenario.expectedStatus,
      actual,
      ok: actual === scenario.expectedStatus && injectionRejectionOk,
      latencyMs: Date.now() - startedAt,
      minConfidence,
      reportStatus,
      verifyStatus,
      verifyIssues,
      ...(errorMessage ? { error: errorMessage } : {}),
    })
  }

  const passed = details.filter(detail => detail.ok).length
  const agent = {
    successRate: round(passed / details.length),
    avgLatencyMs: Math.round(details.reduce((total, detail) => total + detail.latencyMs, 0) / details.length),
    details,
  }

  writeResults('agent', agent)
  console.log(JSON.stringify({ agent: { successRate: agent.successRate, avgLatencyMs: agent.avgLatencyMs } }, null, 2))
}

main().catch(error => {
  console.error(`Agent 评测失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
