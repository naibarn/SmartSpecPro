import path from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
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
let uatBaseURL: string | undefined;
if (isAuthenticatedUat) {
  const envFile =
    process.env.SMARTSPEC_UAT_ENV_FILE ||
    path.join(homedir(), ".config", "smartspec-dev", "web.env");
  const loaded = dotenv.config({ path: envFile, override: true });
  if (loaded.error) throw new Error("UAT_DEVELOPMENT_ENV_FILE_REQUIRED");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  const configuredDevPort = Number(process.env.PORT);
  const port = Number(
    process.env.SMARTSPEC_UAT_WEB_PORT ||
      20_000 +
        (Number.parseInt(
          createHash("sha256").update(uatRunId).digest("hex").slice(0, 8),
          16
        ) %
          20_000)
  );
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    (process.env.NODE_ENV && process.env.NODE_ENV !== "development") ||
    process.env.SMARTSPEC_ENVIRONMENT !== "development" ||
    process.env.SMARTSPEC_DEV_DATABASE_MODE !== "development" ||
    !localHosts.has(databaseUrl.hostname) ||
    !databaseUrl.pathname.slice(1).endsWith("_dev") ||
    !databaseUrl.username.endsWith("_dev") ||
    !Number.isInteger(configuredDevPort) ||
    configuredDevPort < 1024 ||
    configuredDevPort === 3000 ||
    configuredDevPort === 8000 ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    port === 3000 ||
    port === 8000
  ) {
    throw new Error("UAT_DEVELOPMENT_ENVIRONMENT_REQUIRED");
  }
  process.env.SMARTSPEC_UAT_RUN_ID = uatRunId;
  process.env.SMARTSPEC_UAT_BROWSER = uatBrowser;
  process.env.SMARTSPEC_MOLI_UAT_ROOTFS = `/tmp/smarthub-moli-uat-rootfs-${uatRunId.replace(/[^a-zA-Z0-9]/g, "")}`;
  process.env.SMARTSPEC_UAT_SESSION_BROKER = "true";
  process.env.SMARTSPEC_DEV_ENV_FILE = envFile;
  process.env.SMARTSPEC_DEV_WEB_PORT = String(port);
  process.env.NODE_ENV = "development";
  uatBaseURL = `http://127.0.0.1:${port}`;
  process.env.SMARTSPEC_UAT_BASE_URL = uatBaseURL;
}

if (
  isAuthenticatedUat &&
  (process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1" ||
    process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1")
) {
  throw new Error("UAT_REQUIRES_ITS_ISOLATED_DEVELOPMENT_WEB_SERVER");
}
const skipWebServer =
  !isAuthenticatedUat &&
  (process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1" ||
    process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1");
const e2ePort =
  process.env.PLAYWRIGHT_E2E_PORT || process.env.PLAYWRIGHT_PORT || "3017";
const baseURL = isAuthenticatedUat
  ? uatBaseURL!
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
        command: isAuthenticatedUat
          ? "npm run dev"
          : `PORT=${e2ePort} npm run dev:no-watch`,
        url: isAuthenticatedUat ? `${baseURL}/healthz` : baseURL,
        timeout: 120_000,
        reuseExistingServer: !isAuthenticatedUat,
        ...(isAuthenticatedUat
          ? {
              env: {
                SMARTSPEC_DEV_ENV_FILE: process.env.SMARTSPEC_DEV_ENV_FILE!,
                SMARTSPEC_DEV_WEB_PORT: process.env.SMARTSPEC_DEV_WEB_PORT!,
              },
            }
          : {}),
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
