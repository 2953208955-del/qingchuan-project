import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_BYTES = 15 * 1024 * 1024

export function validateImageFile(file: { type: string; size: number }): void {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('只支持 JPG、PNG、WebP 图片')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('单张图片不能超过 15MB')
  }
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function handleUpload(form: FormData, dataDir: string) {
  const file = form.get('file')
  if (!(file instanceof File)) throw new Error('缺少 file 字段')
  validateImageFile({ type: file.type, size: file.size })

  const buffer = Buffer.from(await file.arrayBuffer())
  const hash = sha256(buffer)
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${hash}.${ext}`
  const dir = path.join(dataDir, 'uploads')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  await fs.writeFile(filePath, buffer)
  return { filename: file.name, path: filePath, sha256: hash }
}
