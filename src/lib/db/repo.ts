import { desc, eq } from 'drizzle-orm'
import type { Db } from './client'
import { agentSteps, detections, images, reports, runs } from './schema'

export type RunRow = typeof runs.$inferSelect

export function createRun(db: Db, input: { instruction: string; location: string | null; focusCategories?: string[] }) {
  const now = Date.now()
  const row = {
    id: crypto.randomUUID(),
    status: 'idle',
    instruction: input.instruction,
    location: input.location,
    focusCategories: JSON.stringify(input.focusCategories ?? []),
    createdAt: now,
    updatedAt: now,
  }
  db.insert(runs).values(row).run()
  return row
}

export function getRun(db: Db, id: string) {
  return db.select().from(runs).where(eq(runs.id, id)).get()
}

export function updateRun(db: Db, id: string, patch: Partial<Pick<RunRow, 'status' | 'error' | 'totalCostCny' | 'promptVersion'>>) {
  db.update(runs).set({ ...patch, updatedAt: Date.now() }).where(eq(runs.id, id)).run()
}

export function addImage(db: Db, input: {
  id: string
  runId: string
  filename: string
  path: string
  sha256: string
  status: string
  width?: number | null
  height?: number | null
  exifJson?: string | null
}) {
  db.insert(images).values(input).run()
  return input
}

export function listImages(db: Db, runId: string) {
  return db.select().from(images).where(eq(images.runId, runId)).all()
}

export function updateImage(db: Db, id: string, patch: {
  status?: string
  hint?: string
  width?: number | null
  height?: number | null
  exifJson?: string | null
}) {
  db.update(images).set(patch).where(eq(images.id, id)).run()
}

export function addDetections(db: Db, rows: (typeof detections.$inferInsert)[]) {
  if (rows.length > 0) db.insert(detections).values(rows).run()
}

export function listDetections(db: Db, runId: string) {
  return db.select().from(detections).where(eq(detections.runId, runId)).all()
}

export function updateDetection(db: Db, id: string, patch: Partial<typeof detections.$inferInsert>) {
  db.update(detections).set(patch).where(eq(detections.id, id)).run()
}

export function addAgentStep(db: Db, input: typeof agentSteps.$inferInsert) {
  db.insert(agentSteps).values(input).run()
  return input as typeof agentSteps.$inferSelect
}

export function updateAgentStep(db: Db, id: string, patch: Partial<typeof agentSteps.$inferInsert>) {
  db.update(agentSteps).set(patch).where(eq(agentSteps.id, id)).run()
}

export function saveReport(db: Db, input: { id: string; runId: string; version: number; contentJson: string; status: string }) {
  db.insert(reports).values({ ...input, createdAt: Date.now() }).run()
}

export function getLatestReport(db: Db, runId: string) {
  return db.select().from(reports).where(eq(reports.runId, runId)).orderBy(desc(reports.version)).get()
}

export function markReportStale(db: Db, runId: string) {
  db.update(reports).set({ status: 'stale' }).where(eq(reports.runId, runId)).run()
}
