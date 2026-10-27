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
