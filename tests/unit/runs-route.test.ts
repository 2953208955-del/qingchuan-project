import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/runs/route'
import { MAX_IMAGES_PER_RUN } from '@/lib/domain/limits'

function request(imageCount: number): Request {
  return new Request('http://localhost/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: '检查河岸塑料垃圾',
      images: Array.from({ length: imageCount }, (_, i) => ({
        filename: `${i}.jpg`,
        path: `/nonexistent/${i}.jpg`,
        sha256: String(i),
      })),
    }),
  })
}

describe('POST /api/runs image cap', () => {
  it('rejects more than the documented per-run image cap', async () => {
    const res = await POST(request(MAX_IMAGES_PER_RUN + 1))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'TOO_MANY_IMAGES' })
  })

  it('lets a request at the cap reach path validation', async () => {
    const res = await POST(request(MAX_IMAGES_PER_RUN))
    // Past the cap check, the fake paths fail the uploads-dir validation, so
    // this proves the boundary itself is accepted.
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_IMAGE_PATH' })
  })
})
