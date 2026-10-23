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

type Scenario = { name: string; instruction: string; expectedStatus: string }

type ScenarioDetail = {
  name: string
  expected: string
  actual: string
  ok: boolean
  latencyMs: number
  error?: string
}

const ROOT = process.cwd()
const SCENARIO_FILE = path.resolve(ROOT, 'tests/eval/agent-scenarios.json')
const SAMPLE_IMAGE = path.resolve(ROOT, 'public/samples/sample-1.jpg')
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
    return {
      name: (record.name as string).trim(),
      instruction: (record.instruction as string).trim(),
      expectedStatus: (record.expectedStatus as string).trim(),
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
        '请直接运行 npm run eval:agent（需要 DASHSCOPE_API_KEY、DEEPSEEK_API_KEY 和 public/samples/sample-1.jpg）。',
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

  if (!fs.existsSync(SAMPLE_IMAGE)) {
    throw new Error(`缺少 Agent 评测样例图：${SAMPLE_IMAGE}。请放入真实巡检图片后重试。`)
  }
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`缺少种子知识库文件：${SEED_FILE}`)
  }

  const scenarios = readScenarios()
  const capCny = budgetCapCny()
  const sampleSha256 = crypto.createHash('sha256').update(fs.readFileSync(SAMPLE_IMAGE)).digest('hex')

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
  const reporter = new DeepSeekReportGenerator()

  const details: ScenarioDetail[] = []
  for (const scenario of scenarios) {
    const startedAt = Date.now()
    let actual = 'error'
    let errorMessage: string | undefined

    try {
      const run = repo.createRun(db, { instruction: scenario.instruction, location: null })
      repo.addImage(db, {
        id: crypto.randomUUID(),
        runId: run.id,
        filename: 'sample-1.jpg',
        path: SAMPLE_IMAGE,
        sha256: sampleSha256,
        status: 'pending',
      })
      actual = await runInspection(run.id, {
        db,
        repo,
        vision,
        retrieval,
        reporter,
        verifier: { verify: verifyReport },
        // Per-run budget: each scenario starts from zero, matching a real run.
        budget: new BudgetTracker(capCny),
        emit: () => {},
        now: () => new Date(),
      })
      if (actual === 'failed') {
        const failedRun = repo.getRun(db, run.id)
        if (failedRun?.error) errorMessage = failedRun.error
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
      expected: scenario.expectedStatus,
      actual,
      ok: actual === scenario.expectedStatus && injectionRejectionOk,
      latencyMs: Date.now() - startedAt,
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
