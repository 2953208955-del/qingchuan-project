import { describe, it, expect } from 'vitest'
import {
  estimateCostCny,
  BudgetTracker,
  BudgetExceededError,
  dailyBudgetError,
  localDayBounds,
  parseBudgetCny,
  runBudgetFromEnv,
  dailyBudgetFromEnv,
} from '@/lib/ai/budget'

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

describe('budget env parsing', () => {
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['blank', '  '],
    ['not a number', 'abc'],
    ['NaN', 'NaN'],
    ['positive infinity', 'Infinity'],
    ['negative infinity', '-Infinity'],
    ['zero', '0'],
    ['negative', '-2'],
  ])('never returns a non-finite/non-positive value (%s)', (_label, raw) => {
    const parsed = parseBudgetCny(raw, 1.5)
    expect(parsed).toBe(1.5)
    expect(Number.isFinite(parsed)).toBe(true)
    expect(parsed).toBeGreaterThan(0)
  })

  it('accepts a finite positive override', () => {
    expect(parseBudgetCny('0.25', 1)).toBe(0.25)
    expect(parseBudgetCny(3, 1)).toBe(3)
  })

  it('reads both env vars with their documented fallbacks', () => {
    expect(runBudgetFromEnv({ RUN_BUDGET_CNY: 'nope' })).toBe(1)
    expect(dailyBudgetFromEnv({ DAILY_BUDGET_CNY: '0' })).toBe(20)
    expect(runBudgetFromEnv({ RUN_BUDGET_CNY: '0.8' })).toBe(0.8)
  })
})

describe('daily budget gate', () => {
  it('returns local-midnight boundaries', () => {
    const now = new Date(2026, 9, 24, 15, 30, 0)
    const { start, end } = localDayBounds(now)
    expect(new Date(start)).toEqual(new Date(2026, 9, 24, 0, 0, 0, 0))
    expect(new Date(end)).toEqual(new Date(2026, 9, 25, 0, 0, 0, 0))
  })

  it('rejects at or above the cap and allows below it', () => {
    expect(dailyBudgetError(19.99, 20)).toBeNull()
    expect(dailyBudgetError(20, 20)).toContain('今日 API 预算')
    expect(dailyBudgetError(25, 20)).toContain('已用完')
  })
})
