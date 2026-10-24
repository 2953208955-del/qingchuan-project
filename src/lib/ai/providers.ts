import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { DEFAULT_TEXT_MODEL, DEFAULT_VISION_MODEL } from './models'

export function getTextModelId() {
  return process.env.TEXT_MODEL ?? DEFAULT_TEXT_MODEL
}

export function getTextModel() {
  return createOpenAICompatible({
    name: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  })(getTextModelId())
}

export function getVisionModelId() {
  return process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL
}

export const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

// Per-call ceiling for the direct (non-SDK) DashScope requests. The SDK calls
// have their own transport timeouts; these three fetches would otherwise hang
// a run until the platform-level timeout fires.
export const AI_CALL_TIMEOUT_MS = 60_000
