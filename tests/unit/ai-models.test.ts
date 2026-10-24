import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_RERANK_MODEL,
  DEFAULT_VISION_MODEL,
} from '@/lib/ai/models'
import { getVisionModelId } from '@/lib/ai/providers'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'
import { parseEnv } from '@/lib/utils/env'

const KEYS = { DEEPSEEK_API_KEY: 'deepseek-key', DASHSCOPE_API_KEY: 'dashscope-key' }

// The current DashScope account no longer exposes the 2025 model names; these
// tests pin the names the provider actually accepts so a stale default cannot
// silently fall back to a 404 at runtime.
describe('DashScope model compatibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('defaults to the model names available on the current DashScope account', () => {
    expect(DEFAULT_VISION_MODEL).toBe('qwen3-vl-plus')
    expect(DEFAULT_EMBEDDING_MODEL).toBe('qwen3.7-text-embedding')
    expect(DEFAULT_RERANK_MODEL).toBe('qwen3.7-text-rerank')
  })

  it('resolves the vision model from the environment with the current default', () => {
    const previous = process.env.VISION_MODEL
    delete process.env.VISION_MODEL
    try {
      expect(getVisionModelId()).toBe(DEFAULT_VISION_MODEL)
    } finally {
      if (previous !== undefined) process.env.VISION_MODEL = previous
    }
  })

  it('exposes the model names as env defaults', () => {
    const env = parseEnv(KEYS)
    expect(env.VISION_MODEL).toBe(DEFAULT_VISION_MODEL)
    expect(env.EMBEDDING_MODEL).toBe(DEFAULT_EMBEDDING_MODEL)
    expect(env.RERANK_MODEL).toBe(DEFAULT_RERANK_MODEL)
  })

  it('sends the current embedding model without the unsupported dimensions field', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 })
    }))
    const previous = process.env.EMBEDDING_MODEL
    delete process.env.EMBEDDING_MODEL
    try {
      const vectors = await new DashScopeEmbedder('key').embed(['hello'])
      expect(body.model).toBe(DEFAULT_EMBEDDING_MODEL)
      expect(body).not.toHaveProperty('dimensions')
      expect(vectors).toEqual([[0.1, 0.2]])
    } finally {
      if (previous !== undefined) process.env.EMBEDDING_MODEL = previous
    }
  })

  it('sends the current rerank model with the body the native endpoint accepts', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({ output: { results: [{ index: 0, relevance_score: 0.9 }] } }),
        { status: 200 },
      )
    }))
    const previous = process.env.RERANK_MODEL
    delete process.env.RERANK_MODEL
    try {
      const results = await new DashScopeReranker('key').rerank('query', ['a', 'b'], 1)
      expect(body.model).toBe(DEFAULT_RERANK_MODEL)
      expect(body.parameters).toEqual({ return_documents: false, top_n: 1 })
      expect(results).toEqual([{ index: 0, score: 0.9 }])
    } finally {
      if (previous !== undefined) process.env.RERANK_MODEL = previous
    }
  })

  it('retries a dropped embedding connection instead of failing the request', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }))
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ embedding: [0.3, 0.4] }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const vectors = await new DashScopeEmbedder('key').embed(['hello'])
    expect(vectors).toEqual([[0.3, 0.4]])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after the transport retry budget', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('fetch failed') })
    vi.stubGlobal('fetch', fetchMock)
    await expect(new DashScopeEmbedder('key').embed(['hello'])).rejects.toThrow('fetch failed')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
