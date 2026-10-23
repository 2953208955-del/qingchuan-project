import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { addImage, createRun } from '@/lib/db/repo'
import { scanForInjection } from '@/lib/safety/injection'
import { DebrisCategory } from '@/lib/domain/schemas'
import { RateLimiter, clientKey } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'

const runsLimiter = new RateLimiter(10, 60_000)
const CATEGORY_VALUES = new Set<string>(DebrisCategory.options)

type ImageInput = { filename: string; path: string; sha256: string }

export async function POST(request: Request) {
  if (!runsLimiter.check(clientKey(request))) {
    return NextResponse.json({ code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试', retryable: true }, { status: 429 })
  }

  const body = await request.json() as {
    instruction?: string
    location?: string | null
    focusCategories?: string[]
    images?: ImageInput[]
  }
  if (!body.instruction?.trim()) {
    return NextResponse.json({ code: 'INVALID_INPUT', message: '指令不能为空', retryable: false }, { status: 400 })
  }
  if (scanForInjection(body.instruction).suspicious) {
    return NextResponse.json({ code: 'PROMPT_INJECTION', message: '指令包含可疑内容', retryable: false }, { status: 400 })
  }
  if (!body.images?.length) {
    return NextResponse.json({ code: 'NO_IMAGES', message: '至少上传一张图片', retryable: false }, { status: 400 })
  }
  // focusCategories is user input: reject unknown categories instead of letting
  // a typo silently change what the VLM is asked to look for.
  if (body.focusCategories !== undefined) {
    if (
      !Array.isArray(body.focusCategories) ||
      body.focusCategories.some(value => typeof value !== 'string' || !CATEGORY_VALUES.has(value))
    ) {
      return NextResponse.json({ code: 'INVALID_INPUT', message: '关注类别不合法', retryable: false }, { status: 400 })
    }
  }

  const uploadsDir = path.resolve(process.env.DATA_DIR ?? './data', 'uploads')
  const resolvedImages: { filename: string; path: string; sha256: string }[] = []
  for (const image of body.images) {
    const resolved = path.resolve(image.path)
    if (!resolved.startsWith(uploadsDir + path.sep) || !fs.existsSync(resolved)) {
      return NextResponse.json({ code: 'INVALID_IMAGE_PATH', message: '图片路径非法', retryable: false }, { status: 400 })
    }
    // Persist the absolute path so later reads (image serving, vision calls)
    // never depend on the server's current working directory.
    resolvedImages.push({ filename: image.filename, path: resolved, sha256: image.sha256 })
  }

  const db = getDb()
  const run = createRun(db, {
    instruction: body.instruction.trim(),
    location: body.location ?? null,
    focusCategories: body.focusCategories,
  })
  for (const image of resolvedImages) {
    addImage(db, {
      id: crypto.randomUUID(), runId: run.id,
      filename: image.filename, path: image.path, sha256: image.sha256, status: 'pending',
    })
  }
  return NextResponse.json(run)
}
