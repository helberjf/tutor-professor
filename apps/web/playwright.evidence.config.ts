import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Only invoked by check-evidence.mjs, which expects exactly one deliberate failure.
export default defineConfig({
  ...config,
  testDir: './e2e/evidence-check',
  testIgnore: [],
  outputDir: 'evidence-results',
  projects: [{ name: 'chromium', use: config.projects?.[0].use }],
  reporter: [['list'], ['json', { outputFile: 'evidence-results/results.json' }]],
});
