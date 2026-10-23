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

  it('keeps the rejected cost after throwing and still rejects later adds', () => {
    const b = new BudgetTracker(0.5)
    expect(() => b.add(0.6)).toThrow(BudgetExceededError)
    expect(b.spent).toBeCloseTo(0.6)
    expect(b.remaining).toBe(0)
    expect(() => b.add(0)).toThrow(BudgetExceededError)
  })

  it('starts from an existing spend so follow-up calls share the run cap', () => {
    const b = new BudgetTracker(1, 0.4)
    expect(b.spent).toBeCloseTo(0.4)
    expect(b.remaining).toBeCloseTo(0.6)
    b.add(0.2)
    expect(b.spent).toBeCloseTo(0.6)
    expect(() => b.add(0.5)).toThrow(BudgetExceededError)
    expect(b.spent).toBeCloseTo(1.1)
  })
})
