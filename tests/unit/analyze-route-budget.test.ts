import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const state = vi.hoisted(() => ({ budgetSpent: -1 }))

vi.mock('@/lib/agent/orchestrator', () => ({
  runInspection: vi.fn(async (_runId: string, deps: { budget: { spent: number } }) => {
    state.budgetSpent = deps.budget.spent
    return 'completed'
  }),
}))

import { getDb } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { POST } from '@/app/api/runs/[id]/analyze/route'

let dataDir: string

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingchuan-analyze-budget-'))
  vi.stubEnv('DATA_DIR', dataDir)
  vi.stubEnv('DASHSCOPE_API_KEY', '')
  vi.stubEnv('DEEPSEEK_API_KEY', '')
  migrate(getDb(), { migrationsFolder: path.resolve('drizzle') })
})

afterAll(() => {
  const db = getDb() as unknown as { $client?: { close?: () => void } }
  db.$client?.close?.()
  vi.unstubAllEnvs()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('POST /api/runs/[id]/analyze budget seeding', () => {
  it('carries the planner cost stored on the run into the analysis budget', async () => {
    const db = getDb()
    const run = repo.createRun(db, { instruction: '检查塑料', location: null })
    repo.addImage(db, {
      id: crypto.randomUUID(),
      runId: run.id,
      filename: 'a.png',
      path: path.join(dataDir, 'uploads', 'a.png'),
      sha256: 'abc',
      status: 'pending',
    })
    repo.updateRun(db, run.id, { totalCostCny: 0.0123, status: 'planned' })

    const res = await POST(
      new Request(`http://localhost/api/runs/${run.id}/analyze`, { method: 'POST' }),
      { params: Promise.resolve({ id: run.id }) },
    )

    expect(res.status).toBe(200)
    await res.text()
    expect(state.budgetSpent).toBeCloseTo(0.0123)
  })
})
