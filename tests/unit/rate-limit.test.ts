import { describe, it, expect } from 'vitest'
import { RATE_LIMITS, RateLimiter, clientKey } from '@/lib/http/rate-limit'

describe('rate limiting', () => {
  it('enforces the knowledge-search allowance independently of analysis', () => {
    const search = new RateLimiter(RATE_LIMITS.knowledgeSearch.limit, RATE_LIMITS.knowledgeSearch.windowMs)
    const analyze = new RateLimiter(RATE_LIMITS.analyze.limit, RATE_LIMITS.analyze.windowMs)
    const now = 1_000_000

    // The 4th analyze is rejected, while search still has its own budget.
    for (let i = 0; i < RATE_LIMITS.analyze.limit; i++) {
      expect(analyze.check('ip', now + i)).toBe(true)
    }
    expect(analyze.check('ip', now + 10)).toBe(false)

    for (let i = 0; i < RATE_LIMITS.knowledgeSearch.limit; i++) {
      expect(search.check('ip', now + i)).toBe(true)
    }
    expect(search.check('ip', now + 100)).toBe(false)
  })

  it('gives uploads a distinct, more generous allowance than analysis', () => {
    expect(RATE_LIMITS.uploads.limit).toBeGreaterThan(RATE_LIMITS.analyze.limit)
    expect(RATE_LIMITS.knowledgeSearch.limit).toBeGreaterThan(RATE_LIMITS.analyze.limit)
    const uploads = new RateLimiter(RATE_LIMITS.uploads.limit, RATE_LIMITS.uploads.windowMs)
    for (let i = 0; i < RATE_LIMITS.uploads.limit; i++) {
      expect(uploads.check('ip', 0)).toBe(true)
    }
    expect(uploads.check('ip', 0)).toBe(false)
  })

  it('resets after the window and keeps keys separate', () => {
    const limiter = new RateLimiter(2, 1_000)
    expect(limiter.check('a', 0)).toBe(true)
    expect(limiter.check('a', 10)).toBe(true)
    expect(limiter.check('a', 20)).toBe(false)
    expect(limiter.check('b', 20)).toBe(true)
    expect(limiter.check('a', 1_100)).toBe(true)
  })

  it('uses the first forwarded hop as the key', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    })
    expect(clientKey(request)).toBe('203.0.113.7')
    expect(clientKey(new Request('http://localhost'))).toBe('local')
  })
})
