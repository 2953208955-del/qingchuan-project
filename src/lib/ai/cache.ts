import { eq } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { analysisCache } from '@/lib/db/schema'

export function getCached<T>(db: Db, key: string): T | null {
  const row = db.select().from(analysisCache).where(eq(analysisCache.key, key)).get()
  return row ? (JSON.parse(row.valueJson) as T) : null
}

export function setCached(db: Db, key: string, value: unknown): void {
  db.insert(analysisCache).values({ key, valueJson: JSON.stringify(value), createdAt: Date.now() })
    .onConflictDoNothing().run()
}
