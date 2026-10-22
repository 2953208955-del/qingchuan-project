import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import * as schema from './schema'

export function createDb(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export type Db = ReturnType<typeof createDb>

let singleton: Db | null = null

export function getDb(): Db {
  if (!singleton) {
    const dataDir = process.env.DATA_DIR ?? './data'
    singleton = createDb(path.join(dataDir, 'qingchuan.db'))
  }
  return singleton
}
