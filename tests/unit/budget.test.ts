import { describe, it, expect } from 'vitest'
import { estimateCostCny, BudgetTracker, BudgetExceededError } from '@/lib/ai/budget'

describe('budget', () => {
  it('estimates cost from token usage', () => {
    const cost = estimateCostCny('deepseek-chat', { inputTokens: 1_000_000, outputTokens: 0 })
    expect(cost).toBeCloseTo(2)
  })

  it('tracks spend and remaining', () => {
    const b = new BudgetTracker(1)
    b.add(0.3)
    expect(b.spent).toBeCloseTo(0.3)
    expect(b.remaining).toBeCloseTo(0.7)
  })

  it('throws when the cap is exceeded', () => {
    const b = new BudgetTracker(0.5)
    expect(() => b.add(0.6)).toThrow(BudgetExceededError)
  })
})
