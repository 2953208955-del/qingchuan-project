import fs from 'node:fs/promises'
import { z } from 'zod'
import { AI_CALL_TIMEOUT_MS, DASHSCOPE_BASE_URL } from '@/lib/ai/providers'
import { VISION_PROMPT } from '@/lib/ai/prompts'
import { extractJson } from '@/lib/ai/generate-json'
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

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchImpl(`${DASHSCOPE_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.apiKey}` },
          signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
          body: JSON.stringify({
            model: this.opts.model,
            temperature: 0.1,
            messages: [
              { role: 'system', content: VISION_PROMPT },
              { role: 'user', content: [
                { type: 'text', text: `请分析这张巡检图片。${hint}` },
                { type: 'image_url', image_url: { url: dataUrl } },
              ] },
            ],
          }),
        })
        if (!res.ok) continue
        const json = await res.json() as {
          choices?: { message?: { content?: string } }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        inputTokens += json.usage?.prompt_tokens ?? 0
        outputTokens += json.usage?.completion_tokens ?? 0
        const content = json.choices?.[0]?.message?.content ?? ''
        const parsed = VisionPayload.safeParse(extractJson(content))
        if (parsed.success) {
          return {
            detections: parsed.data.detections,
            abstained: false,
            usage: { inputTokens, outputTokens },
          }
        }
      } catch {
        // 网络错误或 JSON 解析失败：进入下一次尝试
      }
    }
    return {
      detections: [],
      abstained: true,
      reason: '模型返回无法解析，已标记为无法判定',
      usage: { inputTokens, outputTokens },
    }
  }
}
