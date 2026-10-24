import { NextResponse } from 'next/server'
import { handleUpload } from '@/lib/uploads/image'
import { RATE_LIMITS, RateLimiter, clientKey } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'

// Uploads are unauthenticated writes to disk; keep a separate, more generous
// allowance than analysis but one that still bounds disk/bandwidth abuse.
const uploadLimiter = new RateLimiter(RATE_LIMITS.uploads.limit, RATE_LIMITS.uploads.windowMs)

export async function POST(request: Request) {
  if (!uploadLimiter.check(clientKey(request))) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', message: '上传请求过于频繁，请稍后再试', retryable: true },
      { status: 429 },
    )
  }
  try {
    const form = await request.formData()
    const result = await handleUpload(form, process.env.DATA_DIR ?? './data')
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ code: 'UPLOAD_FAILED', message: (error as Error).message, retryable: false }, { status: 400 })
  }
}
