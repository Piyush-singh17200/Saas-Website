import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // Allow the first parallel batch to warm the Next.js production server before
  // individual assertions time out.
  expect: { timeout: 10_000 },
  fullyParallel: false, // Ensure deterministic execution order
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/e2e-results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // E2E specs mock the API at the browser level, so only the Next.js server is
  // required. CI builds the app before this runs; locally run `pnpm build` once
  // or start `next dev` manually and set PLAYWRIGHT_BASE_URL accordingly.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @workspace/web start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
