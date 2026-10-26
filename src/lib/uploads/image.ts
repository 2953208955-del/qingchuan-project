import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

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

const MAX_DIMENSION = 2000
const MAX_INPUT_PIXELS = 50_000_000

/**
 * Re-encode every upload through sharp. This normalizes orientation and,
 * crucially, drops EXIF/GPS/XMP metadata because sharp only preserves metadata
 * when `withMetadata()` is explicitly requested.
 */
export async function sanitizeImage(
  buffer: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; ext: string }> {
  const pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })

  try {
    if (mime === 'image/png') {
      return { buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' }
    }
    if (mime === 'image/webp') {
      return { buffer: await pipeline.webp({ quality: 90 }).toBuffer(), ext: 'webp' }
    }
    return { buffer: await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer(), ext: 'jpg' }
  } catch {
    throw new Error('图片无法解析或格式不受支持')
  }
}

export async function handleUpload(form: FormData, dataDir: string) {
  const file = form.get('file')
  if (!(file instanceof File)) throw new Error('缺少 file 字段')
  validateImageFile({ type: file.type, size: file.size })

  const original = Buffer.from(await file.arrayBuffer())
  const sanitized = await sanitizeImage(original, file.type)
  const hash = sha256(sanitized.buffer)
  const filename = `${hash}.${sanitized.ext}`
  const dir = path.join(dataDir, 'uploads')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  await fs.writeFile(filePath, sanitized.buffer)
  return { filename: file.name, path: filePath, sha256: hash }
}
