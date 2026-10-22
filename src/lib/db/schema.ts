import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('idle'),
  instruction: text('instruction').notNull(),
  location: text('location'),
  focusCategories: text('focus_categories').notNull().default('[]'),
  promptVersion: text('prompt_version'),
  totalCostCny: real('total_cost_cny').notNull().default(0),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  filename: text('filename').notNull(),
  path: text('path').notNull(),
  sha256: text('sha256').notNull(),
  width: integer('width'),
  height: integer('height'),
  exifJson: text('exif_json'),
  status: text('status').notNull().default('pending'),
  hint: text('hint'),
})

export const detections = sqliteTable('detections', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  imageId: text('image_id').notNull(),
  category: text('category').notNull(),
  material: text('material'),
  confidence: real('confidence').notNull(),
  bboxJson: text('bbox_json'),
  description: text('description').notNull(),
  source: text('source').notNull(),
  reviewStatus: text('review_status').notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
})

export const clauses = sqliteTable('clauses', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull(),
  standardNo: text('standard_no').notNull(),
  clauseNo: text('clause_no').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  categoryTags: text('category_tags').notNull().default('[]'),
  embeddingJson: text('embedding_json').notNull(),
})

export const agentSteps = sqliteTable('agent_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  step: text('step').notNull(),
  status: text('status').notNull(),
  toolName: text('tool_name'),
  inputJson: text('input_json'),
  outputJson: text('output_json'),
  detail: text('detail'),
  latencyMs: integer('latency_ms'),
  costCny: real('cost_cny'),
  error: text('error'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
})

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  version: integer('version').notNull(),
  contentJson: text('content_json').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: integer('created_at').notNull(),
})

export const analysisCache = sqliteTable('analysis_cache', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  imageId: text('image_id').notNull(),
  correctionJson: text('correction_json').notNull(),
  createdAt: integer('created_at').notNull(),
})
