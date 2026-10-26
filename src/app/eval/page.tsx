import fs from 'node:fs'
import path from 'node:path'
import { HoloBadge } from '@/components/holo/holo-badge'
import { HoloPanel } from '@/components/holo/holo-panel'
import { parseRagResults, type RagResults } from '@/lib/eval/rag-results'

export const dynamic = 'force-dynamic'

type DetectionResults = { precision: number; recall: number; f1: number; images: number; mode: string }
type AgentResults = { successRate: number; avgLatencyMs: number }

type Results = {
  generatedAt: string | null
  sectionUpdatedAt: Record<string, string>
  detection: DetectionResults | null
  rag: RagResults | null
  ragHeldout: RagResults | null
  agent: AgentResults | null
}

const COMMANDS = [
  'npm run eval:detection',
  'npm run eval:rag',
  'npm run eval:rag:heldout',
  'npm run eval:agent',
]

const isEmpty: Results = {
  generatedAt: null, sectionUpdatedAt: {}, detection: null,
  rag: null, ragHeldout: null, agent: null,
}

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
    const updated = asRecord(raw.sectionUpdatedAt)
    const sectionUpdatedAt: Record<string, string> = {}
    if (updated) {
      for (const [key, value] of Object.entries(updated)) {
        if (isString(value)) sectionUpdatedAt[key] = value
      }
    }
    return {
      generatedAt: isString(raw.generatedAt) ? raw.generatedAt : null,
      sectionUpdatedAt,
      detection: parseDetection(raw.detection),
      rag: parseRagResults(raw.rag),
      ragHeldout: parseRagResults(raw.ragHeldout),
      agent: parseAgent(raw.agent),
    }
  } catch {
    return isEmpty
  }
}

function UpdatedAt({ value }: { value?: string }) {
  if (!value) return null
  return (
    <p className="eval-generated">
      更新：<time dateTime={value}>{value}</time>
    </p>
  )
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
  const hasResults = results.detection !== null || results.rag !== null
    || results.ragHeldout !== null || results.agent !== null

  return (
    <div className="eval-page">
      <header className="eval-hero">
        <p className="holo-eyebrow">QINGCHUAN · EVALUATION</p>
        <h1>评测</h1>
      </header>

      {results.generatedAt && (
        <p className="eval-generated">
          最后更新：<time dateTime={results.generatedAt}>{results.generatedAt}</time>
        </p>
      )}

      {results.rag && (
        <p className="eval-generated">
          RAG 为自建 {results.rag.total} 题自查；rerank 阈值 0.65、无 reranker 0.45，
          阈值在同一题集上校准，不作为公开基准。
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
              <UpdatedAt value={results.sectionUpdatedAt.detection} />
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
              subtitle={
                results.rag.answerableTotal > 0
                  ? `${results.rag.total} 题 · 可答 ${results.rag.answerableTotal} / 无答案 ${results.rag.noAnswerTotal}`
                  : `${results.rag.total} 题`
              }
              className="eval-panel"
            >
              <UpdatedAt value={results.sectionUpdatedAt.rag} />
              <div className="eval-metrics">
                <Metric label="Recall@5" value={results.rag.recallAt5.toFixed(3)} />
                <Metric label="Recall@3" value={results.rag.recallAt3.toFixed(3)} />
                <Metric label="MRR" value={results.rag.mrr.toFixed(3)} />
                <Metric
                  label="无答案准确率"
                  value={(results.rag.noAnswerAccuracy * 100).toFixed(1)}
                  unit="%"
                />
              </div>
            </HoloPanel>
          )}

          {results.ragHeldout && (
            <HoloPanel
              title="RAG · held-out"
              subtitle={
                results.ragHeldout.answerableTotal > 0
                  ? `${results.ragHeldout.total} 题 · 可答 ${results.ragHeldout.answerableTotal} / 无答案 ${results.ragHeldout.noAnswerTotal}`
                  : `${results.ragHeldout.total} 题`
              }
              className="eval-panel"
            >
              <UpdatedAt value={results.sectionUpdatedAt.ragHeldout} />
              <p className="eval-generated">未参与阈值调参；仅运行一次。</p>
              <div className="eval-metrics">
                <Metric label="Recall@5" value={results.ragHeldout.recallAt5.toFixed(3)} />
                <Metric label="Recall@3" value={results.ragHeldout.recallAt3.toFixed(3)} />
                <Metric label="MRR" value={results.ragHeldout.mrr.toFixed(3)} />
                <Metric
                  label="无答案准确率"
                  value={(results.ragHeldout.noAnswerAccuracy * 100).toFixed(1)}
                  unit="%"
                />
              </div>
            </HoloPanel>
          )}

          {results.agent && (
            <HoloPanel title="Agent" className="eval-panel">
              <UpdatedAt value={results.sectionUpdatedAt.agent} />
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
