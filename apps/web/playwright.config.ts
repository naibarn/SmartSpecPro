import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const skipWebServer =
  process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1" ||
  process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";
const e2ePort =
  process.env.PLAYWRIGHT_E2E_PORT || process.env.PLAYWRIGHT_PORT || "3017";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  outputDir: "./test-results/production-director",
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: path.join(
          "test-results",
          "production-director",
          "playwright-evidence.json"
        ),
      },
    ],
  ],
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
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
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
