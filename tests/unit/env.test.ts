import { describe, it, expect } from 'vitest'
import { parseEnv } from '@/lib/utils/env'

describe('parseEnv', () => {
  it('applies defaults when required keys exist', () => {
    const env = parseEnv({ DEEPSEEK_API_KEY: 'a', DASHSCOPE_API_KEY: 'b' })
    expect(env.DATA_DIR).toBe('./data')
    expect(env.RUN_BUDGET_CNY).toBe(1)
  })

  it('throws naming the missing key', () => {
    expect(() => parseEnv({ DASHSCOPE_API_KEY: 'b' })).toThrow(/DEEPSEEK_API_KEY/)
  })
})
