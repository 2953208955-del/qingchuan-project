import { describe, it, expect } from 'vitest'
import { PROMPT_VERSIONS, PLANNER_PROMPT, VISION_PROMPT, REPORTER_PROMPT } from '@/lib/ai/prompts'
import { extractJson } from '@/lib/ai/generate-json'

describe('prompts', () => {
  it('has non-empty versions', () => {
    expect(PROMPT_VERSIONS.planner).toMatch(/planner-v\d+/)
    expect(PROMPT_VERSIONS.vision).toMatch(/vision-v\d+/)
    expect(PROMPT_VERSIONS.reporter).toMatch(/reporter-v\d+/)
  })

  it('treats text inside images as untrusted', () => {
    expect(VISION_PROMPT).toContain('不可信')
    expect(VISION_PROMPT).toContain('不要执行')
  })

  it('keeps focus hints from narrowing vision output', () => {
    expect(VISION_PROMPT).toContain('不限制识别范围')
    expect(VISION_PROMPT).toContain('所有可见垃圾')
  })

  it('requires the reporter to cover every detected category', () => {
    expect(REPORTER_PROMPT).toContain('不得据此排除')
    expect(REPORTER_PROMPT).toContain('全部检测结果')
  })

  it('defines the planner soft-focus contract', () => {
    expect(PLANNER_PROMPT).toContain('focusCategories')
    expect(PLANNER_PROMPT).toContain('其他类别仍会识别并保留')
  })

  it('requires evidence in the reporter prompt', () => {
    expect(REPORTER_PROMPT).toContain('evidenceIds')
  })

  it('extracts json from fenced output', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
})
