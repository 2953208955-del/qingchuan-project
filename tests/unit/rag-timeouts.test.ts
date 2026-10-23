import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashScopeEmbedder timeout', () => {
  it('passes an abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await new DashScopeEmbedder('k').embed(['query'])

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('propagates an aborted request as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })),
    )

    await expect(new DashScopeEmbedder('k').embed(['query'])).rejects.toThrow('aborted due to timeout')
  })
})

describe('DashScopeReranker timeout', () => {
  it('passes an abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output: { results: [{ index: 0, relevance_score: 0.9 }] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await new DashScopeReranker('k').rerank('query', ['doc'], 1)

    expect(results).toEqual([{ index: 0, score: 0.9 }])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('propagates an aborted request as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })),
    )

    await expect(new DashScopeReranker('k').rerank('query', ['doc'], 1)).rejects.toThrow('aborted due to timeout')
  })
})
