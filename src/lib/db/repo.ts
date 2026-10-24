import { and, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import type { Db } from './client'
import { agentSteps, clauses, detections, images, reports, runs } from './schema'

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

// Daily spend for the budget gate. `totalCostCny` is NOT NULL in the schema,
// but rows written by an older/partial schema may still be NULL; coalesce both
// the per-row value and the empty-set SUM so the gate never sees NaN/null.
// The caller supplies local-midnight [start, end) boundaries.
export function sumRunCostCnyBetween(db: Db, startMs: number, endMs: number): number {
  const row = db.select({
    total: sql<number>`coalesce(sum(coalesce(${runs.totalCostCny}, 0)), 0)`,
  })
    .from(runs)
    .where(and(gte(runs.createdAt, startMs), lt(runs.createdAt, endMs)))
    .get()
  const total = row?.total
  return typeof total === 'number' && Number.isFinite(total) ? total : 0
}

// Atomically move a reviewable run into the in-flight state. Only one caller
// can win the UPDATE; the rest see 0 changes and must answer RUN_BUSY. The
// route checks report staleness first, then this claim closes the check-then-act
// race before any paid regeneration starts.
export function claimRunForRegeneration(db: Db, id: string): number {
  return db.update(runs)
    .set({ status: 'aggregating', updatedAt: Date.now() })
    .where(and(
      eq(runs.id, id),
      inArray(runs.status, ['awaiting_review', 'completed', 'stale', 'failed']),
    ))
    .run()
    .changes
}

// Same check-then-act guard for the initial analysis. Without it two concurrent
// POST /analyze requests could both pass the route's status check and start
// paid vision work; the loser must see 0 changes and answer 409.
export function claimRunForAnalysis(db: Db, id: string): number {
  return db.update(runs)
    .set({ status: 'analyzing', updatedAt: Date.now() })
    .where(and(
      eq(runs.id, id),
      inArray(runs.status, ['idle', 'planned']),
    ))
    .run()
    .changes
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

export function listAgentSteps(db: Db, runId: string) {
  return db.select().from(agentSteps).where(eq(agentSteps.runId, runId)).orderBy(agentSteps.startedAt).all()
}

// Cited-clause panel on the report page: reports reference clauses by
// `clause:<id>` evidence ids; older reports may only list
// {standardNo, clauseNo} citations, so the loader can fall back to those.
export function listClausesByIds(db: Db, ids: string[]) {
  if (ids.length === 0) return []
  return db.select().from(clauses).where(inArray(clauses.id, ids)).all()
}

export function listClausesByCitations(db: Db, citations: { standardNo: string; clauseNo: string }[]) {
  const pairs = citations.flatMap(citation => {
    const standardNo = typeof citation?.standardNo === 'string' ? citation.standardNo : ''
    const clauseNo = typeof citation?.clauseNo === 'string' ? citation.clauseNo : ''
    return standardNo && clauseNo
      ? [and(eq(clauses.standardNo, standardNo), eq(clauses.clauseNo, clauseNo))]
      : []
  })
  if (pairs.length === 0) return []
  const condition = pairs.length === 1 ? pairs[0] : or(...pairs)
  return db.select().from(clauses).where(condition).all()
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
