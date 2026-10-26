import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDb } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { POST } from '@/app/api/runs/[id]/plan/route'

let dataDir: string

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingchuan-plan-route-'))
  vi.stubEnv('DATA_DIR', dataDir)
  // Force the free heuristic path so this route test never calls a paid API.
  vi.stubEnv('DEEPSEEK_API_KEY', '')
  migrate(getDb(), { migrationsFolder: path.resolve('drizzle') })
})

afterAll(() => {
  const db = getDb() as unknown as { $client?: { close?: () => void } }
  db.$client?.close?.()
  vi.unstubAllEnvs()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('POST /api/runs/[id]/plan', () => {
  it('returns the parsed five-step plan and persists the soft focus', async () => {
    const db = getDb()
    const run = repo.createRun(db, { instruction: '只统计塑料类，忽略水草', location: null })
    repo.addImage(db, {
      id: crypto.randomUUID(),
      runId: run.id,
      filename: 'a.png',
      path: path.join(dataDir, 'uploads', 'a.png'),
      sha256: 'abc',
      status: 'pending',
    })

    const res = await POST(
      new Request(`http://localhost/api/runs/${run.id}/plan`, { method: 'POST' }),
      { params: Promise.resolve({ id: run.id }) },
    )

    expect(res.status).toBe(200)
    const plan = await res.json() as {
      parsedBy: string
      focusCategories: string[]
      steps: unknown[]
    }
    expect(plan.parsedBy).toBe('heuristic')
    expect(plan.focusCategories).toEqual(['plastic_bottle', 'plastic_bag', 'foam'])
    expect(plan.steps).toHaveLength(5)
    expect(repo.getRun(db, run.id)?.status).toBe('planned')
  })
})
