import { generateText, type LanguageModel } from 'ai'
import type { z } from 'zod'

export class JsonParseError extends Error {
  constructor(public readonly raw: string) {
    super('模型输出不是合法 JSON')
    this.name = 'JsonParseError'
  }
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new JsonParseError(text)
  return JSON.parse(cleaned.slice(start, end + 1))
}

export async function generateJson<T>(opts: {
  model: LanguageModel
  schema: z.ZodType<T>
  system: string
  prompt: string
  temperature?: number
}): Promise<{ value: T; usage: { inputTokens: number; outputTokens: number }; raw: string }> {
  const result = await generateText({
    model: opts.model,
    system: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature ?? 0.1,
  })
  const parsed = opts.schema.safeParse(extractJson(result.text))
  if (!parsed.success) throw new JsonParseError(result.text)
  return {
    value: parsed.data,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    },
    raw: result.text,
  }
}
