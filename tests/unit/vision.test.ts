import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { QwenVisionAnalyzer } from '@/lib/vision/qwen'

const imagePath = (() => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qc-')), 'a.png')
  fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  return p
})()

function response(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status })
}

describe('QwenVisionAnalyzer', () => {
  it('parses valid JSON', async () => {
    const fetchImpl = vi.fn(async () => response('{"detections":[{"category":"plastic_bottle","material":"PET","confidence":0.9,"bbox":{"x":0.1,"y":0.1,"w":0.2,"h":0.2},"description":"塑料瓶"}]}'))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(false)
    expect(result.detections[0].category).toBe('plastic_bottle')
    // Every direct DashScope call carries a per-call abort signal.
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('asks the provider for a JSON object response', async () => {
    const fetchImpl = vi.fn(async () => response('{"detections":[]}'))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    await analyzer.analyze({ imagePath })
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('clamps out-of-frame boxes and confidence instead of abstaining', async () => {
    const fetchImpl = vi.fn(async () => response(
      '{"detections":[{"category":"metal","material":"aluminum","confidence":1.2,"bbox":{"x":0.95,"y":0.9,"w":0.1,"h":0.2},"description":"can"}]}',
    ))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(false)
    const detection = result.detections[0]
    expect(detection.confidence).toBe(1)
    expect(detection.bbox!.x).toBeCloseTo(0.95)
    expect(detection.bbox!.y).toBeCloseTo(0.9)
    expect(detection.bbox!.w).toBeCloseTo(0.05)
    expect(detection.bbox!.h).toBeCloseTo(0.1)
  })

  it('extracts JSON from fenced output', async () => {
    const fetchImpl = vi.fn(async () => response('```json\n{"detections":[]}\n```'))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(false)
    expect(result.detections).toEqual([])
  })

  it('retries once then abstains on invalid JSON', async () => {
    const fetchImpl = vi.fn(async () => response('not json'))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.abstained).toBe(true)
  })

  it('abstains after a 500 on both model attempts', async () => {
    const fetchImpl = vi.fn(async () => new Response('err', { status: 500 }))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(true)
    expect(result.reason).toBe('服务返回错误，已标记为无法判定')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('accumulates usage from both HTTP 200 attempts when abstaining', async () => {
    const fetchImpl = vi.fn(async () => response('not json'))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(true)
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 })
  })

  it('reports a timeout instead of an unparseable response', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    })
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(true)
    expect(result.reason).toBe('调用超时')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('reports a network failure instead of an unparseable response', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
    })
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(true)
    expect(result.reason).toBe('调用失败（网络错误）')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('recovers when a transport failure is followed by a valid response', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_SOCKET' } }))
      .mockResolvedValue(response('{"detections":[]}'))
    const analyzer = new QwenVisionAnalyzer({ apiKey: 'k', model: 'm', fetchImpl })
    const result = await analyzer.analyze({ imagePath })
    expect(result.abstained).toBe(false)
    expect(result.detections).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
