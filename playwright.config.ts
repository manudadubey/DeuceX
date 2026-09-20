import { defineConfig } from '@playwright/test';

// PORT is overridable so this suite doesn't collide with a dev server another session
// already has bound to 3000 (e.g. several Claude Code sessions on the same machine).
const port = process.env.PORT ?? '3000';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @procircuit/web dev',
    url: `${baseURL}/kitchen-sink`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
