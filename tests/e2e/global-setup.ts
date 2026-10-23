import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve('.playwright/data')

// Playwright starts the web server before global setup; the app opens SQLite
// lazily on the first request, so recreating the directory here is safe and
// gives every run a deterministic database.
export default function globalSetup(): void {
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true })

  // The seed imports through the `@/` alias, which needs tsx's resolver.
  execSync('npx tsx tests/e2e/seed-e2e.ts', {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR },
    stdio: 'inherit',
  })
}
