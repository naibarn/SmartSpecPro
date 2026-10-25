import { expect, test } from "@playwright/test";

test.use({ trace: "on", screenshot: "on" });

const APP_ID = "app_e6f0be051fd22e09bc4c5dff";

function trpcResult(data: unknown) {
  return { result: { data: { json: data } } };
}

test("Mini-App workspace stays usable at desktop and mobile widths during a failed build", async ({ page }, testInfo) => {
  const loadedAssets: string[] = [];
  const consoleErrors: string[] = [];
  let retryRequested = false;
  page.on("response", response => {
    if (response.ok() && /\.(?:css|js)(?:\?|$)/.test(response.url())) loadedAssets.push(response.url());
  });
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.route("**/trpc/**", async route => {
    const procedure = new URL(route.request().url()).pathname.split("/trpc/").pop();
    if (procedure === "appIdentity.resolveMiniApp") {
      await route.fulfill({ json: trpcResult({
        app: { appId: APP_ID, visibility: "private", deploymentVersion: 0, lastKnownGoodArtifactRef: null },
        html: null,
        factory: {
          goal: "Create an expense tracker",
          milestone: "BUILD_FAILED",
          isInProgress: false,
          jobState: "failed",
          currentStage: "ui_implementation",
          latestStageJobId: "job-existing-stage",
          retryable: true,
          completedStages: [],
          remainingStages: ["ui_implementation", "package", "deploy", "smoke"],
          error: { code: "LLMStructuredOutputError", message: "The app build stopped, and your saved work is preserved." },
        },
      }) });
      return;
    }
    if (procedure === "spec226DevelopmentControl.retryMiniAppFactoryStage") {
      retryRequested = true;
      await route.fulfill({ json: trpcResult({ appId: APP_ID, runId: "existing-run" }) });
      return;
    }
    await route.fulfill({ json: trpcResult(null) });
  });

  await page.goto(`/miniapp/${APP_ID}`);
  await expect(page.getByRole("heading", { name: /expense tracker/i })).toBeVisible();
  await expect(page.getByText("The app build stopped, and your saved work is preserved.")).toBeVisible();
  await expect(page.getByTestId("miniapp-status-card")).toBeVisible();
  await expect(page.getByTestId("miniapp-execution-card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry / Repair" })).toBeEnabled();
  await page.getByRole("button", { name: "Technical details" }).click();
  await expect(page.getByText("Code: LLMStructuredOutputError")).toBeVisible();
  await page.getByRole("button", { name: "Retry / Repair" }).click();
  await expect.poll(() => retryRequested).toBe(true);

  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.getByText("No source snapshot or build artifact has been saved yet.")).toBeVisible();
  await page.getByRole("tab", { name: "Builds" }).click();
  await expect(page.getByText("Latest attempt: Implement app interface · Failed")).toBeVisible();
  await page.getByRole("tab", { name: "Progress" }).click();
  await expect(page.getByTestId("miniapp-stage-package")).toBeVisible();

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: /expense tracker/i })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    await page.screenshot({ path: testInfo.outputPath(`miniapp-${viewport.width}.png`), fullPage: true });
  }

  expect(loadedAssets.some(asset => asset.endsWith(".css"))).toBe(true);
  expect(loadedAssets.some(asset => asset.endsWith(".js"))).toBe(true);
  expect(consoleErrors).toEqual([]);
});
