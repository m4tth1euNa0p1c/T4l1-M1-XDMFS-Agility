import { defineConfig } from "vitest/config";

// Live tests call real external services. They are never run in CI.
export default defineConfig({
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
