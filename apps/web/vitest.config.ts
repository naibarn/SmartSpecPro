import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);
const workspaceRoot = path.resolve(templateRoot, "..", "..");

function resolvePackageDir(packageName: string): string {
  const localPackageDir = path.resolve(templateRoot, "node_modules", packageName);
  if (fs.existsSync(localPackageDir)) {
    return localPackageDir;
  }
  return path.resolve(workspaceRoot, "node_modules", packageName);
}

export default defineConfig({
  plugins: [react()],
  root: templateRoot,
  resolve: {
    extensions: [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".json"],
    dedupe: ["react", "react-dom"],
    alias: {
      "react": resolvePackageDir("react"),
      "react-dom": resolvePackageDir("react-dom"),
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
      "@db": path.resolve(templateRoot, "drizzle"),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["client/src/**/*.test.tsx", "jsdom"],
    ],
    include: [
      "drizzle/**/*.test.ts",
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
      "client/src/**/*.spec.ts",
      "shared/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    setupFiles: ["client/src/test-setup.ts"],
    env: {
      CONTROL_PLANE_API_KEY: "test-cp.key",
      CONTROL_PLANE_URL: "http://localhost:7070",
      ORCHESTRATOR_URL: "http://localhost:8000",
    },
    server: {
      deps: {
        inline: [/react/, /react-dom/, /@testing-library/],
      },
    },
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["json-summary", "text"],
      exclude: ["dist/**", "node_modules/**"],
    },
  },
});
