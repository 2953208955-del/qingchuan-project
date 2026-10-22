import { NextResponse } from 'next/server'
import { handleUpload } from '@/lib/uploads/image'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const result = await handleUpload(form, process.env.DATA_DIR ?? './data')
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ code: 'UPLOAD_FAILED', message: (error as Error).message, retryable: false }, { status: 400 })
  }
}
