import { describe, it, expect } from 'vitest'
import { parseEnv } from '@/lib/utils/env'

describe('parseEnv', () => {
  it('applies defaults when required keys exist', () => {
    const env = parseEnv({ DEEPSEEK_API_KEY: 'a', DASHSCOPE_API_KEY: 'b' })
    expect(env.DATA_DIR).toBe('./data')
    expect(env.RUN_BUDGET_CNY).toBe(1)
    expect(env.DAILY_BUDGET_CNY).toBe(20)
  })

  it('throws naming the missing key', () => {
    expect(() => parseEnv({ DASHSCOPE_API_KEY: 'b' })).toThrow(/DEEPSEEK_API_KEY/)
  })

  it('keeps finite positive budget overrides', () => {
    const env = parseEnv({
      DEEPSEEK_API_KEY: 'a', DASHSCOPE_API_KEY: 'b',
      RUN_BUDGET_CNY: '0.5', DAILY_BUDGET_CNY: '12.5',
    })
    expect(env.RUN_BUDGET_CNY).toBe(0.5)
    expect(env.DAILY_BUDGET_CNY).toBe(12.5)
  })

  it.each(['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '0', '-1'])(
    'falls back to the run default for invalid RUN_BUDGET_CNY=%j',
    raw => {
      const env = parseEnv({ DEEPSEEK_API_KEY: 'a', DASHSCOPE_API_KEY: 'b', RUN_BUDGET_CNY: raw })
      expect(env.RUN_BUDGET_CNY).toBe(1)
      expect(Number.isFinite(env.RUN_BUDGET_CNY)).toBe(true)
      expect(env.RUN_BUDGET_CNY).toBeGreaterThan(0)
    },
  )

  it.each(['', 'abc', 'Infinity', '0', '-3'])(
    'falls back to the daily default for invalid DAILY_BUDGET_CNY=%j',
    raw => {
      const env = parseEnv({ DEEPSEEK_API_KEY: 'a', DASHSCOPE_API_KEY: 'b', DAILY_BUDGET_CNY: raw })
      expect(env.DAILY_BUDGET_CNY).toBe(20)
    },
  )
})
