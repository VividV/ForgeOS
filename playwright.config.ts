import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end acceptance tests. They need the app (BASE_URL, default
 * http://localhost:3000) running against a Supabase stack with migrations applied
 * and email auto-confirm enabled (the local stack does this).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
