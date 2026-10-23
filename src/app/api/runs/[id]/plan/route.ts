import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { getRun, listImages } from '@/lib/db/repo'
import { DebrisCategory, Plan } from '@/lib/domain/schemas'

export const runtime = 'nodejs'

const CATEGORY_VALUES = new Set<string>(DebrisCategory.options)

// run.focusCategories is stored user input; malformed JSON or unknown values
// must degrade to an empty/partial list rather than fail the plan request.
function parseFocusCategories(raw: string | null): DebrisCategory[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is DebrisCategory => typeof value === 'string' && CATEGORY_VALUES.has(value))
  } catch {
    return []
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const run = getRun(db, id)
  if (!run) return NextResponse.json({ code: 'NOT_FOUND', message: '任务不存在', retryable: false }, { status: 404 })
  const imageCount = listImages(db, id).length
  if (imageCount === 0) return NextResponse.json({ code: 'NO_IMAGES', message: '没有可分析的图片', retryable: false }, { status: 400 })
  const plan = Plan.parse({
    imageCount,
    focusCategories: parseFocusCategories(run.focusCategories),
    // Rough planning estimates only (5s and ¥0.02 per image); actual latency
    // and cost come from the run's recorded steps.
    estimatedSeconds: imageCount * 5,
    estimatedCostCny: Number((imageCount * 0.02).toFixed(2)),
    output: 'inspection_report',
  })
  return NextResponse.json(plan)
}
