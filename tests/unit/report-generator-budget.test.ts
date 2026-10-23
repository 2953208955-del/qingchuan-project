import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportContext } from '@/lib/agent/types'

const mocks = vi.hoisted(() => ({ generateJson: vi.fn() }))

vi.mock('@/lib/ai/generate-json', () => ({ generateJson: mocks.generateJson }))
vi.mock('@/lib/ai/providers', () => ({
  getTextModel: () => ({}),
  getTextModelId: () => 'deepseek-chat',
}))

import { DeepSeekReportGenerator } from '@/lib/agent/report-generator'
import { BudgetTracker, BudgetExceededError } from '@/lib/ai/budget'

const context: ReportContext = {
  runId: 'r1',
  instruction: '检查塑料',
  location: null,
  inspectedAt: '2026-10-22T00:00:00.000Z',
  detections: [],
  metrics: {
    imageCount: 1,
    detectionCount: 0,
    weightedTotal: 0,
    intensity: 0,
    severity: 'low',
    formulaVersion: 'severity-v1',
  },
  clauses: [],
}

const modelOutput = {
  title: '报告',
  location: null,
  inspectedAt: '',
  claims: [{ id: 'c1', section: 'summary', text: '本次巡检完成。', evidenceIds: ['metric:overall'] }],
  citations: [],
  limitations: [],
}

beforeEach(() => {
  mocks.generateJson.mockClear()
  mocks.generateJson.mockResolvedValue({
    value: modelOutput,
    usage: { inputTokens: 1_000_000, outputTokens: 0 },
    raw: JSON.stringify(modelOutput),
  })
})

describe('DeepSeekReportGenerator budget', () => {
  it('charges the shared tracker after each draft', async () => {
    const budget = new BudgetTracker(10)
    const generator = new DeepSeekReportGenerator({ budget })

    await generator.draft(context)
    // deepseek-chat input is ¥2 / 1M tokens.
    expect(budget.spent).toBeCloseTo(2)

    await generator.repair(context, [])
    expect(budget.spent).toBeCloseTo(4)
  })

  it('propagates BudgetExceededError instead of returning a report', async () => {
    const budget = new BudgetTracker(1)
    const generator = new DeepSeekReportGenerator({ budget })

    await expect(generator.draft(context)).rejects.toThrow(BudgetExceededError)
    expect(budget.spent).toBeCloseTo(2)
  })

  it.each([
    ['exactly at the cap', 1],
    ['over the cap', 1.5],
  ])('refuses to call the model when spend is %s', async (_label, initialSpent) => {
    const budget = new BudgetTracker(1, initialSpent)
    const generator = new DeepSeekReportGenerator({ budget })

    await expect(generator.draft(context)).rejects.toThrow(BudgetExceededError)
    await expect(generator.repair(context, [])).rejects.toThrow(BudgetExceededError)
    // No paid model request was made for either path.
    expect(mocks.generateJson).not.toHaveBeenCalled()
    expect(budget.spent).toBeCloseTo(initialSpent)
  })
})
