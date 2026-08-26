import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/vitest.setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 70,
        lines: 82,
      },
    },
  },
});
