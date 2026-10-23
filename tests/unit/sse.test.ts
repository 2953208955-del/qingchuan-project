import { describe, it, expect } from 'vitest'
import { encodeSse } from '@/lib/agent/sse'
import { RateLimiter } from '@/lib/http/rate-limit'

describe('sse', () => {
  it('encodes a named event with json data', () => {
    const out = encodeSse({ type: 'done', runId: 'r1', status: 'completed' })
    expect(out).toContain('event: done')
    expect(out).toContain('"runId":"r1"')
    expect(out.endsWith('\n\n')).toBe(true)
  })
})

describe('RateLimiter', () => {
  it('blocks after the limit', () => {
    const limiter = new RateLimiter(2, 60_000)
    expect(limiter.check('ip', 0)).toBe(true)
    expect(limiter.check('ip', 0)).toBe(true)
    expect(limiter.check('ip', 0)).toBe(false)
  })

  it('allows again after the window resets', () => {
    const limiter = new RateLimiter(2, 1_000)
    expect(limiter.check('ip', 0)).toBe(true)
    expect(limiter.check('ip', 0)).toBe(true)
    expect(limiter.check('ip', 0)).toBe(false)
    expect(limiter.check('ip', 1_001)).toBe(true)
  })
})
