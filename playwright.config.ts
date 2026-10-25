import { defineConfig } from '@playwright/test'

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`
const DATA_DIR = './.playwright/data'

// E2E runs against a dedicated port and a throwaway DATA_DIR so it never reads
// or writes the developer's ./data or an already-running dev server.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: BASE_URL },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    // Probe a static asset, not `/`: the home page opens SQLite during Next's
    // readiness request, which would cache a handle to the pre-seed database.
    url: `${BASE_URL}/favicon.ico`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATA_DIR },
  },
})
