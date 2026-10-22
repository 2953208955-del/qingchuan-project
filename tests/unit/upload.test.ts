import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateImageFile, sha256, handleUpload } from '@/lib/uploads/image'

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

  it('writes the file under the data dir', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-'))
    const form = new FormData()
    form.append('file', new File([Buffer.from([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' }))
    const result = await handleUpload(form, dir)
    expect(fs.existsSync(result.path)).toBe(true)
    expect(result.filename).toBe('a.png')
  })
})
