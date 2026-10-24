export interface ModelPrice {
  inputCnyPerMillion: number
  outputCnyPerMillion: number
}

export const DEFAULT_RUN_BUDGET_CNY = 1
export const DEFAULT_DAILY_BUDGET_CNY = 20

// Budget env vars are operator-supplied strings. Empty, NaN, Infinity and
// non-positive values must fall back to the documented defaults instead of
// disabling the cap or poisoning arithmetic with NaN.
export function parseBudgetCny(raw: string | number | undefined | null, fallback: number): number {
  if (raw === undefined || raw === null) return fallback
  if (typeof raw === 'string' && raw.trim() === '') return fallback
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function runBudgetFromEnv(source: Partial<NodeJS.ProcessEnv> = process.env): number {
  return parseBudgetCny(source.RUN_BUDGET_CNY, DEFAULT_RUN_BUDGET_CNY)
}

export function dailyBudgetFromEnv(source: Partial<NodeJS.ProcessEnv> = process.env): number {
  return parseBudgetCny(source.DAILY_BUDGET_CNY, DEFAULT_DAILY_BUDGET_CNY)
}

// Local-day window [start, end) used by the daily-spend query. Using local
// midnight (not a rolling 24h window) matches the operator's reading of "today".
export function localDayBounds(now: Date): { start: number; end: number } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(),
  }
}

export function dailyBudgetError(spentCny: number, limitCny: number): string | null {
  if (!Number.isFinite(spentCny) || !Number.isFinite(limitCny)) return null
  return spentCny >= limitCny
    ? `今日 API 预算（¥${limitCny}）已用完，无法开始新的付费操作`
    : null
}

// 2026-10 官网价估算（元 / 百万 token）；价格变化时只改这里。
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'deepseek-chat': { inputCnyPerMillion: 2, outputCnyPerMillion: 8 },
  'qwen2.5-vl-max-latest': { inputCnyPerMillion: 3, outputCnyPerMillion: 9 },
  'qwen-vl-max': { inputCnyPerMillion: 3, outputCnyPerMillion: 9 },
  'text-embedding-v3': { inputCnyPerMillion: 0.5, outputCnyPerMillion: 0 },
  default: { inputCnyPerMillion: 3, outputCnyPerMillion: 9 },
}

export class BudgetExceededError extends Error {
  constructor(message = '单次运行预算已超出') {
    super(message)
    this.name = 'BudgetExceededError'
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export function estimateCostCny(model: string, usage: { inputTokens: number; outputTokens: number }): number {
  const price = MODEL_PRICES[model] ?? MODEL_PRICES.default
  return round6(
    (usage.inputTokens / 1e6) * price.inputCnyPerMillion +
    (usage.outputTokens / 1e6) * price.outputCnyPerMillion,
  )
}

export class BudgetTracker {
  private spentCny: number
  // initialSpentCny lets a follow-up call (report regeneration) keep counting
  // against the same per-run cap instead of starting from zero.
  constructor(private readonly capCny: number, initialSpentCny = 0) {
    this.spentCny = initialSpentCny
  }

  // 超限抛错即终止本次运行：spent 已包含被拒绝的费用，调用方必须立即中止，
  // 不得继续调用 add；后续调用仍会抛错（"恰好达到上限"与"超额"不可区分）。
  add(costCny: number) {
    this.spentCny += costCny
    if (this.spentCny > this.capCny) throw new BudgetExceededError()
  }

  get spent() { return round6(this.spentCny) }
  get remaining() { return round6(Math.max(0, this.capCny - this.spentCny)) }
}
