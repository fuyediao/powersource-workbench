import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/harness',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
