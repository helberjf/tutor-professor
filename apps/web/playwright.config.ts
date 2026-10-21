import { defineConfig, devices } from '@playwright/test';
import { WEB_URL } from './scripts/e2e/safety.mjs';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  testIgnore: ['**/recordings/**', '**/evidence-check/**'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node scripts/e2e/environment.mjs',
    url: WEB_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
