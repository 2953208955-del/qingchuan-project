import { describe, it, expect } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import { extractJson, generateJson, JsonParseError } from '@/lib/ai/generate-json'

function mockModel(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 11, noCache: 11, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 7, text: 7, reasoning: undefined },
        raw: {},
      },
      warnings: [],
    }),
  })
}

describe('extractJson', () => {
  it('parses bare json', () => {
    expect(extractJson('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] })
  })

  it('parses json surrounded by prose', () => {
    expect(extractJson('结果如下：\n{"ok":true}\n以上。')).toEqual({ ok: true })
  })

  it('parses fenced json case-insensitively', () => {
    expect(extractJson('```JSON\n{"x":"y"}\n```')).toEqual({ x: 'y' })
  })

  it('throws JsonParseError when no object is present', () => {
    expect(() => extractJson('没有 JSON')).toThrow(JsonParseError)
  })
})

describe('generateJson', () => {
  const schema = z.object({ count: z.number() })

  it('returns schema-validated value, usage and raw text', async () => {
    const raw = '```json\n{"count":2}\n```'
    const result = await generateJson({
      model: mockModel(raw),
      schema,
      system: 'system',
      prompt: 'prompt',
    })
    expect(result.value).toEqual({ count: 2 })
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 })
    expect(result.raw).toBe(raw)
  })

  it('throws JsonParseError when output violates the schema', async () => {
    await expect(
      generateJson({
        model: mockModel('{"count":"two"}'),
        schema,
        system: 'system',
        prompt: 'prompt',
      }),
    ).rejects.toThrow(JsonParseError)
  })
})
