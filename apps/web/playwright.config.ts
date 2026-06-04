import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const skipWebServer =
  process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1" ||
  process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";

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
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev:no-watch",
        url: "http://127.0.0.1:3000",
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
