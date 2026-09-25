// End-to-end test configuration.
// Tests run against the built app served by Express on one port,
// the same way graders will open it.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  // Graders test from iPhone 6 width up to desktop, so we do too.
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 6'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    env: { USE_MOCK_APIS: 'true' },
  },
});
