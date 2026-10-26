import { describe, expect, it, vi } from 'vitest'
import { DeepSeekInspectionPlanner, normalizePlanIntent, parseInstructionHeuristic } from '@/lib/agent/planner'
import { BudgetExceededError, BudgetTracker } from '@/lib/ai/budget'
import { JsonSchemaError } from '@/lib/ai/generate-json'

describe('parseInstructionHeuristic', () => {
  it('maps 塑料类 to the three plastic categories and drops negated 水草', () => {
    const result = parseInstructionHeuristic('只统计塑料类，忽略水草')

    expect(result.focusCategories).toEqual(['plastic_bottle', 'plastic_bag', 'foam'])
    expect(result.intentSummary).toContain('只统计塑料类')
  })

  it('keeps explicitly named non-plastic categories', () => {
    const result = parseInstructionHeuristic('重点看渔网和玻璃')

    expect(result.focusCategories).toEqual(['fishing_gear', 'glass'])
  })

  it('returns no focus categories for a general instruction', () => {
    const result = parseInstructionHeuristic('检查河岸垃圾')

    expect(result.focusCategories).toEqual([])
  })

  it('treats 不统计塑料 as a negation instead of a focus', () => {
    const result = parseInstructionHeuristic('不统计塑料，重点看玻璃')

    expect(result.focusCategories).toEqual(['glass'])
  })

  it('does not expand a specific bag mention into all plastics', () => {
    const result = parseInstructionHeuristic('重点找塑料袋')

    expect(result.focusCategories).toEqual(['plastic_bag'])
  })

  it('keeps 水草 as natural when it is not negated', () => {
    const result = parseInstructionHeuristic('记录水草和塑料瓶')

    expect(result.focusCategories).toEqual(['plastic_bottle', 'natural'])
  })

  it('caps a long instruction summary', () => {
    const result = parseInstructionHeuristic('检查'.repeat(100))

    expect(result.intentSummary.length).toBeLessThanOrEqual(80)
  })

  it('does not let a negation in an earlier clause hide a later positive mention', () => {
    const result = parseInstructionHeuristic('忽略水草，重点看塑料瓶')

    expect(result.focusCategories).toEqual(['plastic_bottle'])
  })

  it('treats 不要漏掉 and 不要忽略 as double negatives', () => {
    expect(parseInstructionHeuristic('不要漏掉塑料瓶').focusCategories).toEqual(['plastic_bottle'])
    expect(parseInstructionHeuristic('不要忽略泡沫').focusCategories).toEqual(['foam'])
  })

  it('honours postfix negation inside the same clause', () => {
    expect(parseInstructionHeuristic('塑料瓶不要，塑料袋要').focusCategories).toEqual(['plastic_bag'])
    expect(parseInstructionHeuristic('水草忽略').focusCategories).toEqual([])
  })

  it('splits on contrast conjunctions', () => {
    const result = parseInstructionHeuristic('不计水草但看塑料')

    expect(result.focusCategories).toEqual(['plastic_bottle', 'plastic_bag', 'foam'])
  })

  it('selects optional tools only when explicitly requested', () => {
    expect(parseInstructionHeuristic('生成整改工单').tools).toEqual(['create_work_order'])
    expect(parseInstructionHeuristic('查一下河段档案').tools).toEqual(['get_river_profile'])
    expect(parseInstructionHeuristic('检查塑料垃圾').tools).toEqual([])
  })

  it('does not select a negated tool', () => {
    expect(parseInstructionHeuristic('不要生成工单').tools).toEqual([])
  })

  it('does not treat query/status wording as a work-order request', () => {
    expect(parseInstructionHeuristic('查询工单状态').tools).toEqual([])
    expect(parseInstructionHeuristic('这个工单处理得怎么样').tools).toEqual([])
  })
})

describe('normalizePlanIntent', () => {
  it('dedupes model categories and removes categories the user asked to ignore', () => {
    const result = normalizePlanIntent('只统计塑料类，忽略水草', {
      intentSummary: '统计塑料类',
      focusCategories: ['plastic_bottle', 'plastic_bottle', 'natural', 'foam'],
    })

    expect(result.focusCategories).toEqual(['plastic_bottle', 'foam'])
    expect(result.intentSummary).toBe('统计塑料类')
  })

  it('falls back to the instruction when the model summary is blank', () => {
    const result = normalizePlanIntent('检查塑料', {
      intentSummary: '   ',
      focusCategories: [],
    })

    expect(result.intentSummary).toBe('检查塑料')
  })

  it('caps a long model summary', () => {
    const result = normalizePlanIntent('检查塑料', {
      intentSummary: '检查'.repeat(100),
      focusCategories: [],
    })

    expect(result.intentSummary.length).toBeLessThanOrEqual(80)
  })

  it('keeps model focus when the negation belongs to another clause', () => {
    const result = normalizePlanIntent('忽略水草，重点看塑料瓶', {
      intentSummary: '',
      focusCategories: ['plastic_bottle', 'natural'],
    })

    expect(result.focusCategories).toEqual(['plastic_bottle'])
  })

  it('dedupes and filters negated optional tools from model output', () => {
    const requested = normalizePlanIntent('生成工单', {
      intentSummary: '',
      focusCategories: [],
      tools: ['create_work_order', 'create_work_order'],
    })
    expect(requested.tools).toEqual(['create_work_order'])

    const negated = normalizePlanIntent('不要生成工单', {
      intentSummary: '',
      focusCategories: [],
      tools: ['create_work_order'],
    })
    expect(negated.tools).toEqual([])
  })

  it('drops model-selected tools that the instruction never requested', () => {
    const result = normalizePlanIntent('检查塑料垃圾', {
      intentSummary: '',
      focusCategories: [],
      tools: ['get_river_profile', 'create_work_order'],
    })

    expect(result.tools).toEqual([])
  })
})

describe('DeepSeekInspectionPlanner', () => {
  const input = { instruction: '只统计塑料类，忽略水草', imageCount: 2 }

  it('normalizes valid model output and charges the call', async () => {
    const generate = vi.fn(async () => ({
      raw: {
        intentSummary: '统计塑料类',
        focusCategories: ['plastic_bottle', 'natural'],
      },
      usage: { inputTokens: 100, outputTokens: 20 },
    }))
    const budget = new BudgetTracker(1)
    const planner = new DeepSeekInspectionPlanner({ budget, generate })

    const result = await planner.parse(input)

    expect(result).toEqual({
      intentSummary: '统计塑料类',
      focusCategories: ['plastic_bottle'],
      tools: [],
      planningTrace: [],
    })
    expect(budget.spent).toBeGreaterThan(0)
  })

  it('charges tokens and rejects schema-invalid model output', async () => {
    const generate = vi.fn(async () => ({
      raw: { intentSummary: 'x', focusCategories: ['not-a-category'] },
      usage: { inputTokens: 100, outputTokens: 20 },
    }))
    const budget = new BudgetTracker(1)
    const planner = new DeepSeekInspectionPlanner({ budget, generate })

    await expect(planner.parse(input)).rejects.toBeInstanceOf(JsonSchemaError)
    expect(budget.spent).toBeGreaterThan(0)
  })

  it('refuses to call the model when the budget is already exhausted', async () => {
    const generate = vi.fn()
    const planner = new DeepSeekInspectionPlanner({
      budget: new BudgetTracker(1, 1),
      generate,
    })

    await expect(planner.parse(input)).rejects.toBeInstanceOf(BudgetExceededError)
    expect(generate).not.toHaveBeenCalled()
  })

  it('times out a hung model call so the caller can fall back', async () => {
    const planner = new DeepSeekInspectionPlanner({
      generate: () => new Promise(() => {}),
      timeoutMs: 10,
    })

    await expect(planner.parse(input)).rejects.toThrow(/超时|timeout/i)
  }, 500)
})
