import { expect, test } from "./authenticated.fixture";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];

for (const language of ["en", "th"] as const) {
  for (const viewport of viewports) {
    test(`authenticated Task Control overview: ${language} ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(locale => {
        localStorage.setItem("smartspec_locale", locale);
        localStorage.setItem("smartspec_locale_chosen", "true");
      }, language);
      await page.goto("/chat?panel=control-plane&view=full");
      const panel = page.getByTestId("control-plane-panel");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByRole("heading", { name: language === "th" ? "งานล่าสุดของคุณ" : "Your recent work" })).toBeVisible();
      await expect(panel.getByText(language === "th" ? "เริ่มจากแชตใหม่ได้ โดยไม่ต้องเลือกโปรเจกต์" : "Start in a new chat without choosing a project.")).toBeVisible();
      await expect(panel.getByText(language === "th" ? "ยังไม่มีข้อมูลผลลัพธ์ที่ตรวจสอบแล้วในภาพรวมนี้" : "Verified results are not available in this overview.")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("simple-overview.png"), fullPage: true });

      const workMutations: string[] = [];
      page.on("request", request => {
        if (request.method() === "POST" && /spec226DevelopmentControl\.(?:create|startWorkspaceRun|resumeWorkspaceRun|command)/.test(request.url())) workMutations.push(request.url().split("?")[0]);
      });
      await panel.getByRole("button", { name: language === "th" ? "มุมมองนักพัฒนา" : "Developer view" }).click();
      await expect(panel.getByRole("button", { name: language === "th" ? "มุมมองทั่วไป" : "Simple view" })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("developer-overview.png"), fullPage: true });
      await panel.getByRole("button", { name: language === "th" ? "มุมมองทั่วไป" : "Simple view" }).click();
      expect(workMutations).toEqual([]);

      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
  }
}

test("Developer Task Control selects only the connected Runner model catalog", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "th");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  const workMutations: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /spec226DevelopmentControl\.(?:create|startWorkspaceRun|resumeWorkspaceRun|command)/.test(request.url())) workMutations.push(request.url().split("?")[0]);
  });
  await page.goto("/chat?panel=control-plane&view=full");
  const panel = page.getByTestId("control-plane-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "มุมมองนักพัฒนา" }).click();

  const runnerSelector = panel.getByLabel("1. เลือก Runner");
  await expect(runnerSelector).toBeVisible();
  if (await runnerSelector.locator("option").count() < 2) test.skip(true, "No authorized Runner is available for a live catalog browser check");
  await runnerSelector.selectOption({ index: 1 });
  const workspaceSelector = panel.getByLabel("2. เลือก Project Workspace");
  await expect(workspaceSelector).toBeEnabled();
  if (await workspaceSelector.locator("option").count() < 2) test.skip(true, "No current authorized Runner workspace is available");
  await workspaceSelector.selectOption({ index: 1 });
  await expect(panel.getByRole("combobox", { name: "Harness" })).toBeVisible();

  const modelSelector = panel.getByRole("combobox", { name: "AI Model" });
  await expect(modelSelector).toBeVisible();
  if (await modelSelector.isDisabled()) test.skip(true, "The selected Runner has no current account-scoped discovered model catalog");
  await modelSelector.click();
  const modelOptions = panel.getByRole("option");
  await expect(modelOptions.first()).toContainText("Auto");
  expect(await modelOptions.count()).toBeGreaterThan(1);
  await modelOptions.nth(1).click();
  const reasoningOptions = panel.getByRole("radio");
  await expect(reasoningOptions.first()).toBeVisible();
  expect(await reasoningOptions.count()).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("task-control-runner-model-picker.png"), fullPage: true });
  expect(workMutations).toEqual([]);
});

test("a general request can return to the Chat composer without creating development work", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  const developmentMutations: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /spec226DevelopmentControl\.(?:create|startWorkspaceRun|resumeWorkspaceRun)/.test(request.url())) developmentMutations.push(request.url().split("?")[0]);
  });
  await page.goto("/chat?panel=control-plane&view=full");
  const panel = page.getByTestId("control-plane-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByLabel("Task instructions").fill("Summarize my notes");
  await panel.getByRole("button", { name: "Add to chat composer" }).click();
  await expect(page.getByPlaceholder("Type a message or / for skills...")).toHaveValue("Summarize my notes", { timeout: 30_000 });
  expect(developmentMutations).toEqual([]);
});

test("Task Control opens the existing skill selector without executing work", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  const executionRequests: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /(?:spec226DevelopmentControl\.(?:create|startWorkspaceRun|resumeWorkspaceRun)|skills\.(?:execute|run))/.test(request.url())) executionRequests.push(request.url().split("?")[0]);
  });
  await page.goto("/chat?panel=control-plane&view=full");
  const panel = page.getByTestId("control-plane-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Choose a skill" }).click();
  await expect(page.getByText("Select a Skill", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(executionRequests).toEqual([]);
});

test("Mission Control opens the account-wide Project and Thread overview without starting work", async ({ page }) => {
  const executionRequests: string[] = [];
  const controlPlaneFailures: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /spec226DevelopmentControl\.(?:create|startWorkspaceRun|resumeWorkspaceRun|command)/.test(request.url())) executionRequests.push(request.url().split("?")[0]);
  });
  page.on("response", response => {
    if (response.status() >= 500 && /(?:chat\.listRecentConversationThreads|workerJobs\.observability)/.test(response.url())) controlPlaneFailures.push(`${response.status()} ${response.url().split("?")[0]}`);
  });

  await page.goto("/agent-monitor");
  await expect(page.getByRole("heading", { name: "Task Control" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Thread overview" })).toBeVisible();
  await expect(page.getByText(/No work threads match this view|Recent implementation|Loading threads/)).toBeVisible({ timeout: 30_000 });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("region", { name: "Thread overview" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
  await expect.poll(() => controlPlaneFailures).toEqual([]);
  expect(executionRequests).toEqual([]);
});
