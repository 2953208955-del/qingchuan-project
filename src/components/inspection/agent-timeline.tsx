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
      <h2 className="text-sm font-medium">Agent 执行时间线</h2>
      {steps.length === 0 && <p className="text-sm text-muted-foreground">等待开始…</p>}
      {steps.map(step => (
        <div
          key={step.id}
          className="rounded-lg border border-border px-3 py-2 text-sm"
          data-step-status={step.status}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden>{ICONS[step.status]}</span>
            <span className="font-medium">{step.step}</span>
            {step.toolName && <code className="text-xs text-muted-foreground">{step.toolName}</code>}
            {step.latencyMs != null && (
              <span className="ml-auto text-xs text-muted-foreground">{step.latencyMs}ms</span>
            )}
          </div>
          {step.detail && <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>}
        </div>
      ))}
      {finalStatus && (
        <p className="text-sm" aria-live="polite">
          运行状态：<span className="font-medium">{RUN_STATUS_LABELS[finalStatus] ?? finalStatus}</span>
          {runId && (
            <Link href={`/reports/${runId}`} className="ml-2 text-sm text-primary underline underline-offset-2">
              查看报告
            </Link>
          )}
        </p>
      )}
    </section>
  )
}
