'use client'

import Link from 'next/link'
import { useInspectionStore } from '@/stores/inspection-store'
import type { AgentStep } from '@/lib/domain/schemas'

const ICONS: Record<AgentStep['status'], string> = {
  pending: '○', running: '◐', done: '✓', error: '✕', skipped: '—',
}

const RUN_STATUS_LABELS: Record<string, string> = {
  completed: '分析完成',
  awaiting_review: '待人工复核',
  failed: '分析失败',
  stale: '需要重新生成',
}

export function AgentTimeline({ runId = null, finalStatus = null }: {
  runId?: string | null
  finalStatus?: string | null
}) {
  const steps = useInspectionStore(s => s.steps)

  return (
    <section aria-label="Agent 执行时间线" className="space-y-2">
      {steps.length === 0 && <p className="inspect-meta">等待开始…</p>}
      {steps.map(step => (
        <div key={step.id} className="timeline-step" data-step-status={step.status}>
          <div className="timeline-step__head">
            <span className="timeline-step__icon" aria-hidden>{ICONS[step.status]}</span>
            <span className="timeline-step__name">{step.step}</span>
            {step.toolName && <code className="timeline-step__tool">{step.toolName}</code>}
            {step.latencyMs != null && (
              <span className="timeline-step__latency">{step.latencyMs}ms</span>
            )}
          </div>
          {step.detail && <p className="timeline-step__detail">{step.detail}</p>}
        </div>
      ))}
      {finalStatus && (
        <p className="timeline-status" aria-live="polite">
          运行状态：<span className="is-strong">{RUN_STATUS_LABELS[finalStatus] ?? finalStatus}</span>
          {runId && (
            <Link href={`/reports/${runId}`} className="timeline-link">
              查看报告
            </Link>
          )}
        </p>
      )}
    </section>
  )
}
