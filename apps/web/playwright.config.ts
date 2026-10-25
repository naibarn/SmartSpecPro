import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

const isAuthenticatedUat = process.env.SMARTSPEC_BROWSER_UAT === "1";
const uatRunId = process.env.SMARTSPEC_UAT_RUN_ID || randomUUID();
const uatBrowser = process.env.SMARTSPEC_UAT_BROWSER || "chromium";
if (
  isAuthenticatedUat &&
  !["chromium", "moli", "cloudflare"].includes(uatBrowser)
) {
  throw new Error("SMARTSPEC_UAT_BROWSER_UNSUPPORTED");
}
const isMoliUat = isAuthenticatedUat && uatBrowser === "moli";
if (isAuthenticatedUat) {
  const envFile =
    process.env.SMARTSPEC_UAT_ENV_FILE ||
    (process.env.DATABASE_URL
      ? undefined
      : "/home/dev/projects/SmartSpecPro/apps/web/.env");
  if (envFile) dotenv.config({ path: envFile, override: false });
  process.env.SMARTSPEC_UAT_RUN_ID = uatRunId;
  process.env.SMARTSPEC_UAT_BROWSER = uatBrowser;
  process.env.SMARTSPEC_MOLI_UAT_ROOTFS = `/tmp/smarthub-moli-uat-rootfs-${uatRunId.replace(/[^a-zA-Z0-9]/g, "")}`;
  process.env.SMARTSPEC_UAT_SESSION_BROKER = "true";
  // The Playwright broker is a local development process, even when the
  // Debian-hosted app is intentionally running in production-like mode.
  process.env.NODE_ENV = "development";
}

const skipWebServer =
  isAuthenticatedUat ||
  process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1" ||
  process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";
const e2ePort =
  process.env.PLAYWRIGHT_E2E_PORT || process.env.PLAYWRIGHT_PORT || "3017";
const baseURL = isAuthenticatedUat
  ? "https://smartaihub.app"
  : process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${e2ePort}`;
const outputDir = isAuthenticatedUat
  ? path.join("test-results", "smarthub-uat", uatRunId)
  : path.join("test-results", "production-director");

export default defineConfig({
  testDir: "./tests/e2e",
  ...(isAuthenticatedUat
    ? {
        testMatch: "**/uat/**/*.spec.ts",
        globalSetup: "./tests/e2e/uat/globalSetup.ts",
        ...(isMoliUat
          ? { globalTeardown: "./tests/e2e/uat/globalTeardown.ts" }
          : {}),
      }
    : {}),
  timeout: 120_000,
  fullyParallel: isAuthenticatedUat && !isMoliUat,
  workers: isMoliUat ? 1 : isAuthenticatedUat ? 4 : 1,
  retries: isAuthenticatedUat ? 1 : 0,
  outputDir,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: path.join(outputDir, "playwright-evidence.json"),
      },
    ],
  ],
  use: {
    baseURL,
    trace: "off",
    video: isAuthenticatedUat ? "retain-on-failure" : "off",
    screenshot: isAuthenticatedUat ? "only-on-failure" : "off",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: `PORT=${e2ePort} npm run dev:no-watch`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: true,
      },
  projects: [
    isMoliUat
      ? {
          name: "moli",
          use: { browserName: "chromium", ...devices["Desktop Chrome"] },
        }
      : {
          name:
            isAuthenticatedUat && uatBrowser === "cloudflare"
              ? "cloudflare"
              : "chromium",
          use: { ...devices["Desktop Chrome"] },
        },
  ],
});
