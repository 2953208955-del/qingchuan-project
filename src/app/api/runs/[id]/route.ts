import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { getRun, listDetections, listImages } from '@/lib/db/repo'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const run = getRun(db, id)
  if (!run) return NextResponse.json({ code: 'NOT_FOUND', message: '任务不存在', retryable: false }, { status: 404 })
  return NextResponse.json({ run, images: listImages(db, id), detections: listDetections(db, id) })
}
