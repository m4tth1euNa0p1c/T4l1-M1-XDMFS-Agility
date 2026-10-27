import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/{academic,unit,integration,contracts}/**/*.test.ts"],
    environment: "node",
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/api/server.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
