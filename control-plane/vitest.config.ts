import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json", "json-summary", "html"],
    // Critical modules first (raise scope later)
    include: ["src/config.ts", "src/auth.ts", "src/index.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
  },
});
