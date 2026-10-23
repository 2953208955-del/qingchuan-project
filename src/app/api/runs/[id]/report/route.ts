import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { getLatestReport } from '@/lib/db/repo'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = getLatestReport(getDb(), id)
  if (!report) return NextResponse.json({ code: 'NOT_FOUND', message: '报告不存在', retryable: false }, { status: 404 })
  if (report.status === 'stale') {
    return NextResponse.json({ code: 'REPORT_STALE', message: '识别结果已修改，请重新生成报告', retryable: true }, { status: 409 })
  }
  return NextResponse.json(report)
}
