import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { finalizeReport } from '@/lib/agent/report-pipeline'
import { RagRetrievalAdapter } from '@/lib/agent/retrieval-adapter'
import { DeepSeekReportGenerator } from '@/lib/agent/report-generator'
import { verifyReport } from '@/lib/domain/evidence'
import { pendingLowConfidenceCount } from '@/lib/domain/review'
import { parseDetections } from '@/lib/domain/run-detail'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'

export const runtime = 'nodejs'
export const maxDuration = 300

// The run is owned by another request while these are set; regenerating then
// would race the orchestrator's own status/report writes.
const BUSY_STATUSES = new Set(['analyzing', 'aggregating', 'retrieving', 'drafting', 'verifying'])

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = repo.getLatestReport(getDb(), id)
  if (!report) return NextResponse.json({ code: 'NOT_FOUND', message: '报告不存在', retryable: false }, { status: 404 })
  if (report.status === 'stale') {
    return NextResponse.json({ code: 'REPORT_STALE', message: '识别结果已修改，请重新生成报告', retryable: true }, { status: 409 })
  }
  return NextResponse.json(report)
}

// Rebuild the report from the current (reviewed) detection rows. This is the
// end of the human-review loop: once every low-confidence finding is resolved,
// the report can be regenerated and, if it verifies, exported.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const run = repo.getRun(db, id)
  if (!run) return NextResponse.json({ code: 'NOT_FOUND', message: '任务不存在', retryable: false }, { status: 404 })
  if (BUSY_STATUSES.has(run.status)) {
    return NextResponse.json(
      { code: 'RUN_BUSY', message: '任务仍在分析中，请稍后再试', retryable: true },
      { status: 409 },
    )
  }

  const detections = parseDetections(repo.listDetections(db, id))
  if (detections.length === 0) {
    return NextResponse.json(
      { code: 'NO_DETECTIONS', message: '没有可用的识别结果', retryable: false },
      { status: 409 },
    )
  }

  const pendingCount = pendingLowConfidenceCount(detections)
  if (pendingCount > 0) {
    return NextResponse.json(
      {
        code: 'REVIEW_PENDING',
        message: `还需复核 ${pendingCount} 项低置信识别结果`,
        pendingCount,
        retryable: false,
      },
      { status: 409 },
    )
  }

  // Rejected findings are removed from the regenerated report: severity and
  // evidence counts already ignore them, and the reporter must not cite them.
  const activeDetections = detections.filter(detection => detection.reviewStatus !== 'rejected')
  const images = repo.listImages(db, id)
  const analyzed = images.filter(image => image.status === 'analyzed').length
  const detectionImageCount = new Set(detections.map(detection => detection.imageId)).size
  // A run that failed before marking images analyzed can still be regenerated
  // from its detections; the metric must never be zero.
  const analyzedImageCount = Math.max(1, analyzed, detectionImageCount)

  try {
    const apiKey = process.env.DASHSCOPE_API_KEY ?? ''
    const result = await finalizeReport({
      db,
      repo,
      run,
      detections: activeDetections,
      analyzedImageCount,
      retrieval: new RagRetrievalAdapter(db, new DashScopeEmbedder(apiKey), new DashScopeReranker(apiKey)),
      reporter: new DeepSeekReportGenerator(),
      verifier: { verify: verifyReport },
      now: () => new Date(),
    })
    return NextResponse.json({ report: repo.getLatestReport(db, id), runStatus: result.status })
  } catch (error) {
    const message = (error as Error).message || '重新生成报告失败'
    repo.updateRun(db, id, { status: 'failed', error: message })
    return NextResponse.json({ code: 'REPORT_FAILED', message, retryable: true }, { status: 502 })
  }
}
