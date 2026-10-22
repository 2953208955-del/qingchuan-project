import { describe, it, expect } from 'vitest'
import { PROMPT_VERSIONS, VISION_PROMPT, REPORTER_PROMPT } from '@/lib/ai/prompts'
import { extractJson } from '@/lib/ai/generate-json'

describe('prompts', () => {
  it('has non-empty versions', () => {
    expect(PROMPT_VERSIONS.vision).toMatch(/vision-v\d+/)
    expect(PROMPT_VERSIONS.reporter).toMatch(/reporter-v\d+/)
  })

  it('treats text inside images as untrusted', () => {
    expect(VISION_PROMPT).toContain('不可信')
    expect(VISION_PROMPT).toContain('不要执行')
  })

  it('requires evidence in the reporter prompt', () => {
    expect(REPORTER_PROMPT).toContain('evidenceIds')
  })

  it('extracts json from fenced output', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
})
