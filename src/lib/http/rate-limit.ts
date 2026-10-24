// One place for every public endpoint's budget. Each route owns its own
// RateLimiter instance (distinct hit tables), so an upload burst cannot consume
// the allowance for analysis or knowledge search.
export const RATE_LIMITS = {
  runs: { limit: 10, windowMs: 60_000 },
  analyze: { limit: 3, windowMs: 60_000 },
  regenerate: { limit: 3, windowMs: 60_000 },
  knowledgeSearch: { limit: 20, windowMs: 60_000 },
  uploads: { limit: 30, windowMs: 60_000 },
} as const

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  check(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter(t => t > cutoff)
    if (list.length >= this.limit) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    return true
  }
}

/** Rate-limit key: first x-forwarded-for hop, or 'local' for direct traffic. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'local'
}
