import { z } from 'zod'
import { generateText, stepCountIs, tool } from 'ai'
import { DebrisCategory, OptionalTool } from '@/lib/domain/schemas'
import { BudgetExceededError, BudgetTracker, estimateCostCny } from '@/lib/ai/budget'
import {
  extractJson,
  generateJson,
  JsonParseError,
  JsonSchemaError,
  type TokenUsage,
} from '@/lib/ai/generate-json'
import { getTextModel, getTextModelId } from '@/lib/ai/providers'
import { PLANNER_PROMPT, PLANNER_TOOL_PROMPT } from '@/lib/ai/prompts'
import type { Db } from '@/lib/db/client'
import type { Embedder } from '@/lib/rag/embed'
import type { Reranker } from '@/lib/rag/rerank'
import { retrieveClauses } from '@/lib/rag/retrieve'

type Category = z.infer<typeof DebrisCategory>

const PlannerModelOutput = z.object({
  intentSummary: z.string().max(200),
  focusCategories: z.array(DebrisCategory).max(10),
  tools: z.array(OptionalTool).max(2).default([]),
})

export type PlannerGenerator = (
  input: { instruction: string; imageCount: number },
  options?: { signal?: AbortSignal },
) => Promise<{ raw: unknown; usage: TokenUsage }>

export interface PlannerPort {
  parse(input: { instruction: string; imageCount: number }): Promise<PlanIntent>
}

export interface PlannerToolTrace {
  tool: string
  input: unknown
  output: unknown
  latencyMs: number
}

export interface PlanIntent {
  intentSummary: string
  focusCategories: Category[]
  tools: OptionalTool[]
  planningTrace: PlannerToolTrace[]
}

const SUMMARY_MAX = 80

const PLASTIC_CATEGORIES: Category[] = ['plastic_bottle', 'plastic_bag', 'foam']

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  plastic_bottle: ['塑料瓶', '饮料瓶', '矿泉水瓶', 'PET'],
  plastic_bag: ['塑料袋', '包装袋', '马夹袋'],
  foam: ['泡沫塑料', '泡沫'],
  fishing_gear: ['渔网', '渔具', '网具'],
  metal: ['金属', '易拉罐'],
  glass: ['玻璃', '酒瓶'],
  paper: ['纸类', '纸箱', '纸张'],
  textile: ['织物', '衣物', '布料'],
  other: ['其他垃圾'],
  natural: ['水草', '树叶', '自然漂浮物', '浮萍'],
}

const TOOL_KEYWORDS: Record<OptionalTool, string[]> = {
  get_river_profile: ['河段档案', '河段信息', '河道档案', '河道信息', '河段背景'],
  // Creation verbs only: a bare "工单" may be a status/view request and must
  // not trigger a side effect.
  create_work_order: [
    '生成工单', '创建工单', '新建工单', '开单', '派单',
    '整改单', '整改工单', '生成整改单', '创建整改单',
  ],
}

const GENERIC_PLASTIC = ['塑料']

// Negation is scoped to one clause: "忽略水草，重点看塑料瓶" must not turn the
// later plastic mention into a negation just because it is nearby.
const CLAUSE_BOUNDARY_SOURCE = '[，。；、：,.;:!?！？]|但是|但|不过|然而'
const NEGATION_PREFIX = /(忽略|不计|不统计|不纳入|不考虑|不需要|不关注|不计算|排除|不要|无需|不算|不用|别|不看)/
const NEGATION_SUFFIX = /^(?:的)?(?:垃圾|类)?(?:忽略|不计|不统计|不纳入|不考虑|不需要|不关注|不计算|排除|不要|无需|不算|不用|除外|跳过)/
const DOUBLE_NEGATION = /(不要|别|不能|不可|无需|不用)(忽略|漏掉|遗漏|跳过)/

interface Mentions {
  positive: boolean
  negated: boolean
}

function clauseStart(text: string, index: number): number {
  const boundary = new RegExp(CLAUSE_BOUNDARY_SOURCE, 'g')
  let start = 0
  let match: RegExpExecArray | null
  while ((match = boundary.exec(text)) && match.index < index) {
    start = match.index + match[0].length
  }
  return start
}

function clauseEnd(text: string, index: number): number {
  const boundary = new RegExp(CLAUSE_BOUNDARY_SOURCE, 'g')
  boundary.lastIndex = index
  const match = boundary.exec(text)
  return match ? match.index : text.length
}

function mentions(instruction: string, keywords: string[]): Mentions {
  let positive = false
  let negated = false

  for (const keyword of keywords) {
    let from = 0
    while (true) {
      const index = instruction.indexOf(keyword, from)
      if (index === -1) break

      const start = clauseStart(instruction, index)
      const end = clauseEnd(instruction, index)
      const prefix = instruction.slice(Math.max(start, index - 12), index)
      const suffix = instruction.slice(
        index + keyword.length,
        Math.min(end, index + keyword.length + 10),
      )
      // "不要忽略/不要漏掉" is a double negative and must not hide a real
      // focus. Check it before the ordinary prefix negation.
      const doubleNegated = DOUBLE_NEGATION.test(prefix)
      const prefixNegated = !doubleNegated && NEGATION_PREFIX.test(prefix)
      const suffixNegated = NEGATION_SUFFIX.test(suffix)

      if (prefixNegated || suffixNegated) negated = true
      else positive = true
      from = index + keyword.length
    }
  }

  return { positive, negated }
}

function keywordMentions(instruction: string, category: Category): Mentions {
  return mentions(instruction, CATEGORY_KEYWORDS[category])
}

function genericPlasticMentions(instruction: string): Mentions {
  return mentions(instruction, GENERIC_PLASTIC)
}

function isPlastic(category: Category): boolean {
  return PLASTIC_CATEGORIES.includes(category)
}

function summaryFor(instruction: string): string {
  const trimmed = instruction.trim()
  return trimmed.slice(0, SUMMARY_MAX) || '按默认巡检流程执行'
}

function selectTools(instruction: string): OptionalTool[] {
  return OptionalTool.options.filter(tool => mentions(instruction, TOOL_KEYWORDS[tool]).positive)
}

/**
 * Deterministic fallback when the planner model is unavailable. It only
 * derives a soft focus list; it never removes categories from detection,
 * metrics or the report.
 */
export function parseInstructionHeuristic(instruction: string): PlanIntent {
  const selected = new Set<Category>()

  for (const category of DebrisCategory.options) {
    if (keywordMentions(instruction, category).positive) selected.add(category)
  }

  const hasSpecificPlastic = PLASTIC_CATEGORIES.some(category => selected.has(category))
  if (!hasSpecificPlastic && genericPlasticMentions(instruction).positive) {
    for (const category of PLASTIC_CATEGORIES) selected.add(category)
  }

  return {
    intentSummary: summaryFor(instruction),
    // DebrisCategory.options order keeps the UI stable regardless of how the
    // instruction mentions the categories.
    focusCategories: DebrisCategory.options.filter(category => selected.has(category)),
    tools: selectTools(instruction),
    planningTrace: [],
  }
}

/**
 * Model output is untrusted: dedupe it, drop categories the user explicitly
 * asked to ignore, and guarantee a non-empty, bounded summary.
 */
export function normalizePlanIntent(
  instruction: string,
  raw: { intentSummary: string; focusCategories: Category[]; tools?: OptionalTool[] },
  planningTrace: PlannerToolTrace[] = [],
): PlanIntent {
  const focusCategories = [...new Set(raw.focusCategories)].filter(category => {
    const specific = keywordMentions(instruction, category)
    const generic = isPlastic(category) ? genericPlasticMentions(instruction) : { positive: false, negated: false }
    const onlyNegated = (specific.negated || generic.negated) && !specific.positive && !generic.positive
    return !onlyNegated
  })

  const tools = [...new Set(raw.tools ?? [])].filter(tool => {
    const toolMentions = mentions(instruction, TOOL_KEYWORDS[tool])
    // Model output is untrusted: a tool must be positively requested by the
    // user. An unmentioned tool is not permission to act.
    return toolMentions.positive && !toolMentions.negated
  })

  return {
    intentSummary: raw.intentSummary.trim().slice(0, SUMMARY_MAX) || summaryFor(instruction),
    focusCategories,
    tools,
    planningTrace,
  }
}

async function generateWithDeepSeek(
  input: { instruction: string; imageCount: number },
  options?: { signal?: AbortSignal },
): Promise<{ raw: unknown; usage: TokenUsage }> {
  const result = await generateJson({
    model: getTextModel(),
    schema: PlannerModelOutput,
    system: PLANNER_PROMPT,
    prompt: JSON.stringify(input),
    abortSignal: options?.signal,
  })
  return { raw: result.value, usage: result.usage }
}

function isStructuredOutputError(error: unknown): error is JsonParseError | JsonSchemaError {
  return error instanceof JsonParseError || error instanceof JsonSchemaError
}

/**
 * LLM-backed task parser. It only derives a soft focus list; the model never
 * decides metrics, filters detections or writes the report. Failures are left
 * to the caller, which falls back to the deterministic parser.
 */
// DeepSeek can occasionally take >15s from this deployment, so leave enough
// headroom for the model path while still guaranteeing a fallback.
const DEFAULT_PLANNER_TIMEOUT_MS = 30_000

export class DeepSeekInspectionPlanner implements PlannerPort {
  constructor(private readonly opts: {
    budget?: BudgetTracker
    generate?: PlannerGenerator
    timeoutMs?: number
  } = {}) {}

  private charge(usage: TokenUsage): void {
    this.opts.budget?.add(estimateCostCny(getTextModelId(), usage))
  }

  async parse(input: { instruction: string; imageCount: number }): Promise<PlanIntent> {
    if (this.opts.budget && this.opts.budget.remaining <= 0) {
      throw new BudgetExceededError()
    }

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('任务解析超时'))
      }, this.opts.timeoutMs ?? DEFAULT_PLANNER_TIMEOUT_MS)
    })

    let charged = false
    try {
      const generate = this.opts.generate ?? generateWithDeepSeek
      const { raw, usage } = await Promise.race([
        generate(input, { signal: controller.signal }),
        timeout,
      ])
      this.charge(usage)
      charged = true

      const parsed = PlannerModelOutput.safeParse(raw)
      if (!parsed.success) {
        throw new JsonSchemaError(JSON.stringify(raw))
      }
      return normalizePlanIntent(input.instruction, parsed.data)
    } catch (error) {
      // A provider response that failed parsing was billed anyway; persist it
      // before the caller decides to fall back to the heuristic parser.
      if (!charged && isStructuredOutputError(error) && error.usage) this.charge(error.usage)
      throw error
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

export interface PlanningSearchDeps {
  db: Db
  embedder: Embedder
  reranker?: Reranker
}

/**
 * Read-only search exposed as a planner tool. Kept as a plain function so the
 * tool's behaviour can be tested without driving the model loop.
 */
export async function searchStandardsForPlanning(
  deps: PlanningSearchDeps,
  input: { query: string; categories?: Category[] },
) {
  const result = await retrieveClauses(deps, input.query, input.categories ?? [], 5)
  return {
    noEvidence: result.noEvidence,
    clauses: result.clauses.map(clause => ({
      standardNo: clause.standardNo,
      clauseNo: clause.clauseNo,
      title: clause.title,
      score: clause.score,
    })),
  }
}

// Tool calling adds a real retrieval round-trip before the model writes the
// final plan; 45s was too tight on this deployment (observed ~50-60s total).
const DEFAULT_TOOL_PLANNER_TIMEOUT_MS = 90_000

/**
 * Planner with a real Function Calling loop. The model can search the
 * knowledge base before deciding the plan; every tool call is captured in
 * `planningTrace` and persisted with the plan. It never writes metrics or
 * filters detections.
 */
export class DeepSeekPlanningAgent implements PlannerPort {
  constructor(private readonly opts: {
    db: Db
    embedder: Embedder
    reranker?: Reranker
    budget?: BudgetTracker
    timeoutMs?: number
  }) {}

  private charge(usage: TokenUsage): void {
    this.opts.budget?.add(estimateCostCny(getTextModelId(), usage))
  }

  async parse(input: { instruction: string; imageCount: number }): Promise<PlanIntent> {
    if (this.opts.budget && this.opts.budget.remaining <= 0) {
      throw new BudgetExceededError()
    }

    const trace: PlannerToolTrace[] = []
    const searchTool = tool({
      description: '检索已入库的河湖标准条款，用于判断巡检指令是否有依据',
      inputSchema: z.object({
        query: z.string().min(1),
        categories: z.array(DebrisCategory).max(10).default([]),
      }),
      execute: async (args) => {
        const started = Date.now()
        try {
          const output = await searchStandardsForPlanning({
            db: this.opts.db,
            embedder: this.opts.embedder,
            reranker: this.opts.reranker,
          }, args)
          trace.push({
            tool: 'search_standards',
            input: args,
            output,
            latencyMs: Math.max(0, Date.now() - started),
          })
          return output
        } catch (error) {
          const output = { error: error instanceof Error ? error.message : String(error) }
          trace.push({
            tool: 'search_standards',
            input: args,
            output,
            latencyMs: Math.max(0, Date.now() - started),
          })
          return output
        }
      },
    })

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('任务解析超时'))
      }, this.opts.timeoutMs ?? DEFAULT_TOOL_PLANNER_TIMEOUT_MS)
    })

    let charged = false
    try {
      const result = await Promise.race([
        generateText({
          model: getTextModel(),
          system: PLANNER_TOOL_PROMPT,
          prompt: JSON.stringify(input),
          tools: { search_standards: searchTool },
          stopWhen: stepCountIs(4),
          temperature: 0.1,
          abortSignal: controller.signal,
        }),
        timeout,
      ])
      const usage: TokenUsage = {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      }
      this.charge(usage)
      charged = true

      let extracted: unknown
      try {
        extracted = extractJson(result.text)
      } catch (error) {
        if (error instanceof JsonParseError) throw new JsonParseError(error.raw, usage)
        throw error
      }
      const parsed = PlannerModelOutput.safeParse(extracted)
      if (!parsed.success) {
        throw new JsonSchemaError(result.text, usage)
      }
      return normalizePlanIntent(input.instruction, parsed.data, trace)
    } catch (error) {
      if (!charged && isStructuredOutputError(error) && error.usage) this.charge(error.usage)
      throw error
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

