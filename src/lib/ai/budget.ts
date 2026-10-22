export interface ModelPrice {
  inputCnyPerMillion: number
  outputCnyPerMillion: number
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
  private spentCny = 0
  constructor(private readonly capCny: number) {}

  // 超限抛错即终止本次运行：spent 已包含被拒绝的费用，调用方必须立即中止，
  // 不得继续调用 add；后续调用仍会抛错（"恰好达到上限"与"超额"不可区分）。
  add(costCny: number) {
    this.spentCny += costCny
    if (this.spentCny > this.capCny) throw new BudgetExceededError()
  }

  get spent() { return round6(this.spentCny) }
  get remaining() { return round6(Math.max(0, this.capCny - this.spentCny)) }
}
