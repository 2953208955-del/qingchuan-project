import { z } from 'zod'

const EnvSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1),
  DASHSCOPE_API_KEY: z.string().min(1),
  ZHIPU_API_KEY: z.string().optional(),
  DATA_DIR: z.string().default('./data'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  RUN_BUDGET_CNY: z.coerce.number().positive().default(1),
  DAILY_BUDGET_CNY: z.coerce.number().positive().default(20),
  VISION_MODEL: z.string().default('qwen2.5-vl-max-latest'),
  TEXT_MODEL: z.string().default('deepseek-chat'),
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
