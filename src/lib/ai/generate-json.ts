import { generateText, type LanguageModel } from 'ai'
import type { z } from 'zod'

export type TokenUsage = { inputTokens: number; outputTokens: number }

export class JsonParseError extends Error {
  constructor(public readonly raw: string, public readonly usage?: TokenUsage) {
    super('模型输出不是合法 JSON')
    this.name = 'JsonParseError'
  }
}

export class JsonSchemaError extends Error {
  constructor(public readonly raw: string, public readonly usage?: TokenUsage) {
    super('模型输出 JSON 与预期结构不匹配')
    this.name = 'JsonSchemaError'
  }
}

/** Scans one balanced top-level object starting at `start`, respecting JSON strings and escapes. */
function scanObject(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') {
        i++
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  let start = cleaned.indexOf('{')
  while (start !== -1) {
    const candidate = scanObject(cleaned, start)
    if (candidate !== null) {
      try {
        return JSON.parse(candidate)
      } catch {
        // The first balanced top-level object is malformed: do not fall back
        // to nested or later objects.
        throw new JsonParseError(text)
      }
    }
    start = cleaned.indexOf('{', start + 1)
  }
  throw new JsonParseError(text)
}

export async function generateJson<T>(opts: {
  model: LanguageModel
  schema: z.ZodType<T>
  system: string
  prompt: string
  temperature?: number
  abortSignal?: AbortSignal
}): Promise<{ value: T; usage: { inputTokens: number; outputTokens: number }; raw: string }> {
  const result = await generateText({
    model: opts.model,
    system: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature ?? 0.1,
    abortSignal: opts.abortSignal,
  })
  // Failed parse/schema attempts still consumed tokens; carry usage on the
  // error so the reporter can charge them before retrying.
  const usage: TokenUsage = {
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  }
  let extracted: unknown
  try {
    extracted = extractJson(result.text)
  } catch (error) {
    if (error instanceof JsonParseError) throw new JsonParseError(error.raw, usage)
    throw error
  }
  const parsed = opts.schema.safeParse(extracted)
  if (!parsed.success) throw new JsonSchemaError(result.text, usage)
  return {
    value: parsed.data,
    usage,
    raw: result.text,
  }
}
