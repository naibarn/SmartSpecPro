import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json", "json-summary", "html"],
    // initial gate for desktop UI (can raise later)
    thresholds: { lines: 60, functions: 50, branches: 45, statements: 60 },
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
  },
});
