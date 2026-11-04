import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'pnpm --filter @hew/demo-app dev',
    url: 'http://localhost:5179',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
