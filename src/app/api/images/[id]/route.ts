import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { images } from '@/lib/db/schema'

export const runtime = 'nodejs'

const notFound = () =>
  NextResponse.json({ code: 'NOT_FOUND', message: '图片不存在', retryable: false }, { status: 404 })

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = getDb().select().from(images).where(eq(images.id, id)).get()
  if (!row) return notFound()

  // Only ever serve files from the uploads directory, even if a row's path was
  // tampered with or written by an older version.
  const uploadsDir = path.resolve(process.env.DATA_DIR ?? './data', 'uploads')
  const resolved = path.resolve(row.path)
  if (!resolved.startsWith(uploadsDir + path.sep)) return notFound()

  let buffer: Buffer
  try {
    buffer = await fs.readFile(resolved)
  } catch {
    return notFound()
  }
  const type = resolved.endsWith('.png') ? 'image/png' : resolved.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } })
}
