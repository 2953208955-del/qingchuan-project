import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export function getTextModel() {
  return createOpenAICompatible({
    name: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  })(process.env.TEXT_MODEL ?? 'deepseek-chat')
}

export function getVisionModelId() {
  return process.env.VISION_MODEL ?? 'qwen2.5-vl-max-latest'
}

export const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
