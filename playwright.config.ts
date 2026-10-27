import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } },
    },
  ],
  webServer: {
    // Deterministic mode: no LLM key, isolated database.
    command: "npx tsx src/api/server.ts",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    env: { PORT: "3100", LLM_PROVIDER: "none", XDMFS_DB_PATH: "data/e2e.sqlite" },
    timeout: 60_000,
  },
});
