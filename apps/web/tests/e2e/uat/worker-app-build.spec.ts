import { expect, test } from "./authenticated.fixture";

test.use({ uatRole: "admin" });

test("admin can start and see a Worker App build", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/api/desktop-releases/worker-app/builds", async route => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: {
          build: {
            id: "uat-worker-build",
            version: "0.1.433",
            status: "queued",
            runUrl: null,
            error: null,
          },
        },
      });
    } else {
      await route.fulfill({ json: { builds: [] } });
    }
  });
  await page.goto("/admin/desktop-host", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const button = page.getByRole("button", {
    name: /Build Worker App|เริ่ม build Worker App/i,
  });
  await expect(button).toBeVisible({ timeout: 30_000 });
  const languagePrompt = page.getByRole("button", {
    name: /Continue with English/i,
  });
  await languagePrompt
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => undefined);
  if (await languagePrompt.isVisible().catch(() => false))
    await languagePrompt.click();
  await button.click();
  await expect(page.getByText(/0\.1\.433/)).toBeVisible();
  await expect(button).toBeDisabled();
});
