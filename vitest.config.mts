import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
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
