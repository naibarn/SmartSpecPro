import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
      "@db": path.resolve(templateRoot, "drizzle"),
    },
  },
  test: {
    environment: "node",
    env: {
      JWT_SECRET:
        process.env.JWT_SECRET ??
        "test-jwt-secret-32-chars-minimum-1234567890",
    },
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "shared/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["json-summary", "text"],
      exclude: ["dist/**", "node_modules/**"],
    },
  },
});
