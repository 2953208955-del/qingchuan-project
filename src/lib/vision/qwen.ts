import fs from 'node:fs/promises'
import { z } from 'zod'
import { AI_CALL_TIMEOUT_MS, DASHSCOPE_BASE_URL } from '@/lib/ai/providers'
import { VISION_PROMPT } from '@/lib/ai/prompts'
import { extractJson, JsonParseError } from '@/lib/ai/generate-json'
import { BBox, DebrisCategory } from '@/lib/domain/schemas'

const VisionDetection = z.object({
  category: DebrisCategory,
  material: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  bbox: BBox.nullable(),
  description: z.string().max(500),
})
const VisionPayload = z.object({ detections: z.array(VisionDetection) })
export type VisionDetection = z.infer<typeof VisionDetection>

// Raw shapes without the bounds refinement: Qwen occasionally nudges an edge
// box past 1.0 (e.g. x=0.92, w=0.08), and abstaining the whole image over that
// rounding is worse than clamping it back to the frame.
const RawBBox = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
const RawVisionDetection = z.object({
  category: DebrisCategory,
  material: z.string().nullable(),
  confidence: z.number(),
  bbox: RawBBox.nullable(),
  description: z.string().max(500),
})
const RawVisionPayload = z.object({ detections: z.array(RawVisionDetection) })

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1)
}

function normalizeBbox(bbox: z.infer<typeof RawBBox> | null): { x: number; y: number; w: number; h: number } | null {
  if (!bbox) return null
  const x = clamp01(bbox.x)
  const y = clamp01(bbox.y)
  return {
    x,
    y,
    w: Math.min(clamp01(bbox.w), 1 - x),
    h: Math.min(clamp01(bbox.h), 1 - y),
  }
}

export interface VisionResult {
  detections: VisionDetection[]
  abstained: boolean
  reason?: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface VisionPort {
  analyze(input: { imagePath: string; focusCategories?: string[]; hint?: string }): Promise<VisionResult>
}

function mimeOf(file: string) {
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

export class QwenVisionAnalyzer implements VisionPort {
  constructor(private readonly opts: {
    apiKey: string
    model: string
    fetchImpl?: typeof fetch
    systemPrompt?: string
  }) {}

  async analyze(input: { imagePath: string; focusCategories?: string[]; hint?: string }): Promise<VisionResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch
    const buffer = await fs.readFile(input.imagePath)
    const dataUrl = `data:${mimeOf(input.imagePath)};base64,${buffer.toString('base64')}`
    const hint = [
      input.focusCategories?.length ? `重点关注类别：${input.focusCategories.join(', ')}` : '',
      input.hint ? `人工提示：${input.hint}` : '',
    ].filter(Boolean).join('\n')

    // A response that reached HTTP 200 consumed tokens even if its content was
    // unusable, so usage is accumulated across attempts and kept on abstention.
    let inputTokens = 0
    let outputTokens = 0
    // The abstention reason describes the last attempt. A timeout or a dropped
    // connection is an infrastructure failure, not an unparseable response.
    let lastFailure: 'timeout' | 'network' | 'http' | 'invalid' = 'invalid'
    // Model-output failures follow the spec's single retry; transport failures
    // get a slightly larger budget because this deployment's link to DashScope
    // intermittently drops the first connections.
    const MODEL_ATTEMPTS = 2
    const TRANSPORT_ATTEMPTS = 4
    let modelFailures = 0

    for (let attempt = 0; attempt < TRANSPORT_ATTEMPTS; attempt++) {
      try {
        const res = await fetchImpl(`${DASHSCOPE_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.apiKey}` },
          signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
          body: JSON.stringify({
            model: this.opts.model,
            temperature: 0.1,
            // JSON mode keeps Qwen from emitting malformed objects such as
            // {"x":0.43,0.12,0.65,0.22} (observed without it).
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: this.opts.systemPrompt ?? VISION_PROMPT },
              { role: 'user', content: [
                { type: 'text', text: `请分析这张巡检图片。${hint}` },
                { type: 'image_url', image_url: { url: dataUrl } },
              ] },
            ],
          }),
        })
        if (!res.ok) {
          lastFailure = 'http'
          modelFailures += 1
          if (modelFailures >= MODEL_ATTEMPTS) break
          continue
        }
        const json = await res.json() as {
          choices?: { message?: { content?: string } }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        inputTokens += json.usage?.prompt_tokens ?? 0
        outputTokens += json.usage?.completion_tokens ?? 0
        const content = json.choices?.[0]?.message?.content ?? ''
        const raw = RawVisionPayload.safeParse(extractJson(content))
        if (raw.success) {
          const parsed = VisionPayload.safeParse({
            detections: raw.data.detections.map(d => ({
              ...d,
              confidence: clamp01(d.confidence),
              bbox: normalizeBbox(d.bbox),
            })),
          })
          if (parsed.success) {
            return {
              detections: parsed.data.detections,
              abstained: false,
              usage: { inputTokens, outputTokens },
            }
          }
        }
        lastFailure = 'invalid'
        modelFailures += 1
        if (modelFailures >= MODEL_ATTEMPTS) break
      } catch (error) {
        if (error instanceof JsonParseError) {
          // The provider answered but its payload was unusable: this is a
          // model-output failure and follows the single-retry budget.
          lastFailure = 'invalid'
          modelFailures += 1
          if (modelFailures >= MODEL_ATTEMPTS) break
        } else {
          // Transport failure: retry without consuming the model-output budget.
          lastFailure = (error as { name?: string } | null)?.name === 'TimeoutError' ? 'timeout' : 'network'
        }
      }
    }
    return {
      detections: [],
      abstained: true,
      reason: lastFailure === 'timeout'
        ? '调用超时'
        : lastFailure === 'network'
          ? '调用失败（网络错误）'
          : lastFailure === 'http'
            ? '服务返回错误，已标记为无法判定'
            : '模型返回无法解析，已标记为无法判定',
      usage: { inputTokens, outputTokens },
    }
  }
}
