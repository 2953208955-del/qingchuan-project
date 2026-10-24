import { z } from 'zod'
import {
  DEFAULT_DAILY_BUDGET_CNY,
  DEFAULT_RUN_BUDGET_CNY,
  parseBudgetCny,
} from '@/lib/ai/budget'
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_RERANK_MODEL,
  DEFAULT_TEXT_MODEL,
  DEFAULT_VISION_MODEL,
} from '@/lib/ai/models'

// Invalid/empty budget strings fall back to the default instead of failing the
// whole environment parse: a typo must not silently disable the cap, but it
// must also not make the app unable to boot.
const budget = (fallback: number) => z.preprocess(
  value => {
    if (value === undefined || value === null) return undefined
    const parsed = parseBudgetCny(value as string | number, Number.NaN)
    return Number.isFinite(parsed) ? parsed : undefined
  },
  z.number().positive().default(fallback),
)

const EnvSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1),
  DASHSCOPE_API_KEY: z.string().min(1),
  ZHIPU_API_KEY: z.string().optional(),
  DATA_DIR: z.string().default('./data'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  RUN_BUDGET_CNY: budget(DEFAULT_RUN_BUDGET_CNY),
  DAILY_BUDGET_CNY: budget(DEFAULT_DAILY_BUDGET_CNY),
  VISION_MODEL: z.string().default(DEFAULT_VISION_MODEL),
  TEXT_MODEL: z.string().default(DEFAULT_TEXT_MODEL),
  EMBEDDING_MODEL: z.string().default(DEFAULT_EMBEDDING_MODEL),
  RERANK_MODEL: z.string().default(DEFAULT_RERANK_MODEL),
})

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(source: Partial<NodeJS.ProcessEnv> = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const keys = result.error.issues.map(i => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment: ${keys}`)
  }
  return result.data
}
