import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://tripsync:tripsync@localhost:5432/tripsync_test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "api", testMatch: /api\.spec\.ts/ },
    { name: "desktop", testMatch: /ui\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } },
    { name: "mobile", testMatch: /mobile\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: TEST_DB, TRIPSYNC_DISABLE_RATELIMIT: "1" },
  },
});
