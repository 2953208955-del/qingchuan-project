import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { validateImageFile, sha256, handleUpload } from '@/lib/uploads/image'

async function pngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: '#00ff00' },
  }).png().toBuffer()
}

describe('upload validation', () => {
  it('rejects non-images', () => {
    expect(() => validateImageFile({ type: 'text/plain', size: 10 })).toThrow(/图片/)
  })

  it('rejects files over 15MB', () => {
    expect(() => validateImageFile({ type: 'image/png', size: 16 * 1024 * 1024 })).toThrow(/15MB/)
  })

  it('accepts png and hashes deterministically', async () => {
    validateImageFile({ type: 'image/png', size: 3 })
    expect(sha256(Buffer.from('abc'))).toBe(sha256(Buffer.from('abc')))
  })

  it('writes the sanitized file under the data dir', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-'))
    const form = new FormData()
    form.append('file', new File([new Uint8Array(await pngBuffer())], 'a.png', { type: 'image/png' }))
    const result = await handleUpload(form, dir)
    expect(fs.existsSync(result.path)).toBe(true)
    expect(result.filename).toBe('a.png')
    expect(result.sha256).toHaveLength(64)
  })

  it('strips EXIF/GPS metadata before writing the file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-'))
    const withExif = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#ff0000' },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'privacy-test', Make: 'Qingchuan' } } })
      .toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()

    const form = new FormData()
    form.append('file', new File([new Uint8Array(withExif)], 'private.jpg', { type: 'image/jpeg' }))
    const result = await handleUpload(form, dir)
    const stored = fs.readFileSync(result.path)
    const metadata = await sharp(stored).metadata()

    expect(metadata.exif).toBeUndefined()
    expect(stored.equals(withExif)).toBe(false)
  })

  it('rejects bytes that are not a parseable image', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-'))
    const form = new FormData()
    form.append('file', new File([new Uint8Array(Buffer.from('not an image'))], 'bad.png', { type: 'image/png' }))

    await expect(handleUpload(form, dir)).rejects.toThrow(/图片/)
  })
})
