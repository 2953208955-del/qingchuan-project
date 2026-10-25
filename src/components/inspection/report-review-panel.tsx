'use client'

import { useRouter } from 'next/navigation'
import { isPendingLowConfidence } from '@/lib/domain/review'
import type { Detection, RunStatus } from '@/lib/domain/schemas'
import { ReviewQueue } from './review-queue'

// Persisted runs must be reviewable without having streamed in this browser
// tab. The report page loads detections on the server, so this small client
// wrapper can hand them to the same queue the workbench uses and refresh the
// server document after every review decision.
export function ReportReviewPanel({
  runId,
  runStatus,
  stale,
  detections,
}: {
  runId: string
  runStatus: RunStatus
  stale: boolean
  detections: Detection[]
}) {
  const router = useRouter()
  // The only gate is "are there unreviewed low-confidence rows?". Do not hide
  // review behind a particular run status: a persisted run whose report still
  // loads must stay reviewable in a fresh browser tab (C1). The queue is fed
  // only those rows, so the report page never offers unrelated detections.
  const pending = detections.filter(isPendingLowConfidence)
  if (pending.length === 0) return null

  const note = stale
    ? '报告已过期；处理完下列识别结果后，请重新生成报告再导出。'
    : runStatus === 'failed'
      ? '任务曾中断；处理完下列识别结果后，请重新生成报告。'
      : '以下低置信识别结果必须先确认、删除或纠正，之后才能重新生成报告并导出。'

  return (
    <section aria-label="报告复核" className="report-section report-review" data-print-hide>
      <h2 className="report-section__title">人工复核</h2>
      <p className="report-section__hint report-review__note">{note}</p>
      <ReviewQueue
        runId={runId}
        detections={pending}
        onChanged={() => router.refresh()}
      />
    </section>
  )
}
