import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

type DetectionResults = { precision: number; recall: number; f1: number; images: number; mode: string }
type RagResults = { recallAt5: number; total: number }
type AgentResults = { successRate: number; avgLatencyMs: number }

type Results = {
  generatedAt: string | null
  detection: DetectionResults | null
  rag: RagResults | null
  agent: AgentResults | null
}

const COMMANDS = ['npm run eval:detection', 'npm run eval:rag', 'npm run eval:agent']

const isEmpty: Results = { generatedAt: null, detection: null, rag: null, agent: null }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function parseDetection(value: unknown): DetectionResults | null {
  const record = asRecord(value)
  if (!record) return null
  if (!isNumber(record.precision) || !isNumber(record.recall) || !isNumber(record.f1)
    || !isNumber(record.images) || !isString(record.mode)) return null
  return { precision: record.precision, recall: record.recall, f1: record.f1, images: record.images, mode: record.mode }
}

function parseRag(value: unknown): RagResults | null {
  const record = asRecord(value)
  if (!record || !isNumber(record.recallAt5) || !isNumber(record.total)) return null
  return { recallAt5: record.recallAt5, total: record.total }
}

function parseAgent(value: unknown): AgentResults | null {
  const record = asRecord(value)
  if (!record || !isNumber(record.successRate) || !isNumber(record.avgLatencyMs)) return null
  return { successRate: record.successRate, avgLatencyMs: record.avgLatencyMs }
}

// results.json is produced by the evaluation scripts (Task 23). A missing,
// partial or corrupt file must degrade to "no results", never crash the page.
function loadResults(): Results {
  const file = path.resolve('data/eval/results.json')
  try {
    if (!fs.existsSync(file)) return isEmpty
    const raw = asRecord(JSON.parse(fs.readFileSync(file, 'utf8')))
    if (!raw) return isEmpty
    return {
      generatedAt: isString(raw.generatedAt) ? raw.generatedAt : null,
      detection: parseDetection(raw.detection),
      rag: parseRag(raw.rag),
      agent: parseAgent(raw.agent),
    }
  } catch {
    return isEmpty
  }
}

export default function EvalPage() {
  const results = loadResults()
  const hasResults = results.detection !== null || results.rag !== null || results.agent !== null

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">评测</h1>

      {results.generatedAt && (
        <p className="text-xs text-muted-foreground">生成时间：{results.generatedAt}</p>
      )}

      {!hasResults && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">尚未运行评测。运行以下命令生成 data/eval/results.json：</p>
          <ul className="space-y-1 rounded-lg border border-border p-3 font-mono text-xs">
            {COMMANDS.map(command => <li key={command}>{command}</li>)}
          </ul>
        </div>
      )}

      {results.detection && (
        <section className="rounded-lg border border-border p-3">
          <h2 className="text-sm font-medium">检测（GT 匹配，IoU ≥ 0.5）</h2>
          {results.detection.mode === 'dry-run' && (
            <p role="alert" className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
              dry-run，仅验证评测管线，不作为效果证据
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            P {results.detection.precision.toFixed(3)} · R {results.detection.recall.toFixed(3)} ·
            F1 {results.detection.f1.toFixed(3)} · {results.detection.images} 张 · {results.detection.mode}
          </p>
        </section>
      )}

      {results.rag && (
        <section className="rounded-lg border border-border p-3">
          <h2 className="text-sm font-medium">RAG</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Recall@5 {results.rag.recallAt5.toFixed(3)} · {results.rag.total} 题
          </p>
        </section>
      )}

      {results.agent && (
        <section className="rounded-lg border border-border p-3">
          <h2 className="text-sm font-medium">Agent</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            成功率 {results.agent.successRate.toFixed(3)} · 平均 {Math.round(results.agent.avgLatencyMs)}ms
          </p>
        </section>
      )}
    </div>
  )
}
