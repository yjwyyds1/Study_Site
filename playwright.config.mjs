import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4321';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL, channel: process.env.STUDY_BROWSER || 'msedge', colorScheme: 'light', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 90000 }
});
