import { ReportDraft } from '@/lib/domain/schemas'
import type { Detection, UploadedImage } from '@/lib/domain/schemas'
import { parseDetections, parseImages } from '@/lib/domain/run-detail'

// Client-side counterpart to the report page loader. Both the analysis stream
// and the workbench's post-review refresh need "run detail, then latest
// report", where a 409 means the report is stale. Keeping it here prevents the
// two callers from drifting apart.

type RunDetailBody = {
  run?: { instruction?: unknown } | null
  images?: unknown
  detections?: unknown
}

export type RunResults = {
  images: UploadedImage[]
  detections: Detection[]
  report: ReportDraft | null
  reportStale: boolean
  instruction: string | null
}

export async function responseMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null
  return typeof body?.message === 'string' && body.message ? body.message : fallback
}

async function loadLatestReport(
  runId: string,
  signal?: AbortSignal,
): Promise<{ report: ReportDraft | null; reportStale: boolean }> {
  try {
    const res = await fetch(`/api/runs/${runId}/report`, { signal })
    if (res.status === 409) return { report: null, reportStale: true }
    if (!res.ok) return { report: null, reportStale: false }
    const row = (await res.json()) as { contentJson?: unknown }
    if (typeof row.contentJson !== 'string') return { report: null, reportStale: false }
    const parsed = ReportDraft.safeParse(JSON.parse(row.contentJson))
    return { report: parsed.success ? parsed.data : null, reportStale: false }
  } catch {
    // The report is secondary on the workbench: a failure must not turn a
    // completed analysis into an error screen.
    return { report: null, reportStale: false }
  }
}

export async function fetchRunResults(
  runId: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<RunResults> {
  const detailRes = await fetch(`/api/runs/${runId}`, { signal })
  if (!detailRes.ok) throw new Error(await responseMessage(detailRes, '读取分析结果失败'))
  const detail = (await detailRes.json()) as RunDetailBody
  const { report, reportStale } = await loadLatestReport(runId, signal)
  return {
    images: parseImages(detail.images),
    detections: parseDetections(detail.detections),
    report,
    reportStale,
    instruction: typeof detail.run?.instruction === 'string' ? detail.run.instruction : null,
  }
}
