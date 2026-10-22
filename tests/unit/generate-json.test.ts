import { describe, it, expect } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import {
  extractJson,
  generateJson,
  JsonParseError,
  JsonSchemaError,
} from '@/lib/ai/generate-json'

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

  it('ignores a trailing brace in prose after the json object', () => {
    expect(extractJson('{"a":1}\n注意：}')).toEqual({ a: 1 })
  })

  it('does not terminate on braces or escaped quotes inside strings', () => {
    expect(extractJson('{"a":"} { \\"x\\"","b":2} trailing }')).toEqual({ a: '} { "x"', b: 2 })
  })

  it('throws JsonParseError when no object is present', () => {
    expect(() => extractJson('没有 JSON')).toThrow(JsonParseError)
  })

  it('throws JsonParseError on malformed json', () => {
    expect(() => extractJson('{"a": }')).toThrow(JsonParseError)
  })

  it('throws JsonParseError on an unterminated object', () => {
    expect(() => extractJson('{"a":1')).toThrow(JsonParseError)
  })

  it('throws JsonParseError instead of returning a valid nested object', () => {
    expect(() => extractJson('{"outer":{"count":2} oops}')).toThrow(JsonParseError)
  })

  it('throws JsonParseError instead of skipping a malformed object for a later one', () => {
    expect(() => extractJson('{"broken": }\n{"a":1}')).toThrow(JsonParseError)
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

  it('throws JsonSchemaError when output violates the schema', async () => {
    await expect(
      generateJson({
        model: mockModel('{"count":"two"}'),
        schema,
        system: 'system',
        prompt: 'prompt',
      }),
    ).rejects.toThrow(JsonSchemaError)
  })

  it('uses a schema-mismatch message distinct from the parse error', async () => {
    await expect(
      generateJson({
        model: mockModel('{"count":"two"}'),
        schema,
        system: 'system',
        prompt: 'prompt',
      }),
    ).rejects.toThrow(/结构/)
  })

  it('throws JsonParseError when output is malformed json', async () => {
    await expect(
      generateJson({
        model: mockModel('{"count": }'),
        schema,
        system: 'system',
        prompt: 'prompt',
      }),
    ).rejects.toThrow(JsonParseError)
  })

  it('parses json followed by prose containing a closing brace', async () => {
    const result = await generateJson({
      model: mockModel('{"count":3}\n注意：}'),
      schema,
      system: 'system',
      prompt: 'prompt',
    })
    expect(result.value).toEqual({ count: 3 })
  })
})
