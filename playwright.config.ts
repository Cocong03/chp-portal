import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against the deployed Dev site (BC Dev behind it). Never point E2E_BASE_URL at UAT or production:
 * the drafts test writes and deletes a draft.
 *   npm run e2e:login   once (or when the session expires): sign in by hand in the window that opens
 *   npm run e2e         run the tests with that saved session
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://chp-portal-dev.powerappsportals.com',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'login', testMatch: /login\.setup\.ts/, timeout: 600_000, use: { headless: false } },
    { name: 'dev', testMatch: /\.spec\.ts/, use: { storageState: 'e2e/.auth/user.json' } },
  ],
})
