import fs from 'node:fs'
import path from 'node:path'
import { HoloBadge } from '@/components/holo/holo-badge'
import { HoloPanel } from '@/components/holo/holo-panel'

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

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="eval-metric">
      <span className="eval-metric__label">{label}</span>
      <span className="eval-metric__value">
        {value}
        {unit && <span className="eval-metric__unit">{unit}</span>}
      </span>
    </div>
  )
}

export default function EvalPage() {
  const results = loadResults()
  const hasResults = results.detection !== null || results.rag !== null || results.agent !== null

  return (
    <div className="eval-page">
      <header className="eval-hero">
        <p className="holo-eyebrow">QINGCHUAN · EVALUATION</p>
        <h1>评测</h1>
      </header>

      {results.generatedAt && (
        <p className="eval-generated">
          生成时间：<time dateTime={results.generatedAt}>{results.generatedAt}</time>
        </p>
      )}

      {!hasResults && (
        <HoloPanel className="eval-empty-panel">
          <div className="eval-empty">
            <p>尚未运行评测。运行以下命令生成 data/eval/results.json：</p>
            <ul className="eval-commands">
              {COMMANDS.map(command => <li key={command}>{command}</li>)}
            </ul>
          </div>
        </HoloPanel>
      )}

      {hasResults && (
        <div className="eval-grid">
          {results.detection && (
            <HoloPanel
              title="检测（GT 匹配，IoU ≥ 0.5）"
              subtitle={`${results.detection.images} 张`}
              actions={
                <HoloBadge tone={results.detection.mode === 'dry-run' ? 'gold' : 'cyan'}>
                  {results.detection.mode}
                </HoloBadge>
              }
              className="eval-panel eval-panel--detection"
            >
              {results.detection.mode === 'dry-run' && (
                <p role="alert" className="eval-dry-run">
                  dry-run，仅验证评测管线，不作为效果证据
                </p>
              )}
              <div className="eval-metrics">
                <Metric label="P" value={results.detection.precision.toFixed(3)} />
                <Metric label="R" value={results.detection.recall.toFixed(3)} />
                <Metric label="F1" value={results.detection.f1.toFixed(3)} />
              </div>
            </HoloPanel>
          )}

          {results.rag && (
            <HoloPanel
              title="RAG"
              subtitle={`${results.rag.total} 题`}
              className="eval-panel"
            >
              <div className="eval-metrics">
                <Metric label="Recall@5" value={results.rag.recallAt5.toFixed(3)} />
              </div>
            </HoloPanel>
          )}

          {results.agent && (
            <HoloPanel title="Agent" className="eval-panel">
              <div className="eval-metrics">
                <Metric label="成功率" value={results.agent.successRate.toFixed(3)} />
                <Metric label="平均延迟" value={String(Math.round(results.agent.avgLatencyMs))} unit="ms" />
              </div>
            </HoloPanel>
          )}
        </div>
      )}
    </div>
  )
}
