import { expect, test, type Page } from "playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

async function mockAdminApi(page: Page) {
  await page.route("**/trpc/**", async route => {
    const url = new URL(route.request().url());
    const procedure = url.pathname.replace(/^\/trpc\//, "").split(",")[0];
    let data: unknown = {};
    switch (procedure) {
      case "auth.me":
        data = {
          id: 90001,
          email: "cloudflare-admin-browser@smartspec.local",
          name: "Cloudflare Admin Browser",
          role: "admin",
          currentTenantId: "tenant-browser-test",
          credits: 0,
        };
        break;
      case "systemSettings.getSettingsByCategory":
      case "sttProviders.templates":
      case "follows.getUrgentMessages":
      case "scheduledMessages.getUrgentReminders":
      case "scheduledMessages.getNotifications":
        data = [];
        break;
      case "systemSettings.getVerticalDramaEnhancedRuntimeSettings":
        data = { settings: { enabled: false, authoringModelId: "" }, runtime: {} };
        break;
      case "scheduledMessages.getNotificationCount":
        data = { count: 0 };
        break;
      case "infrastructure.getDeployModeInfo":
        data = {
          mode: "localhost",
          target: "cloudflare",
          source: "browser-test",
          runtime: { hardCutover: false },
        };
        break;
      case "infrastructure.getRedisHealth":
        data = {
          cache: { healthy: false },
          realtime: { healthy: false },
          legacy: { healthy: false },
        };
        break;
      case "infrastructure.getMonitoringStatus":
        data = {
          sentry: { nodeConfigured: false, pythonConfigured: false },
          posthog: { configured: false },
          ga4: { configured: false },
          firebase: { configured: false },
        };
        break;
      case "infrastructure.getScaleTier":
        data = { tier: "small", deployMode: "localhost", allTiers: [] };
        break;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: trpcData(data),
    });
  });
}

for (const viewport of VIEWPORTS) {
  test(`Cloudflare Search Cache guide renders safely at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      localStorage.setItem("smartspec_locale", "th");
      localStorage.setItem("smartspec_locale_chosen", "true");
    });
    await mockAdminApi(page);

    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/admin/settings?tab=infrastructure");
    const cloudflareTab = page.getByRole("tab", { name: "Cloudflare" });
    await cloudflareTab.click();

    await expect(page.getByText("smartspec-cloudflare-runtime", { exact: false })).toBeVisible();
    await expect(page.getByText("SEARCH_RESULT_CACHE", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("CLOUDFLARE_SEARCH_CACHE_TOKEN", { exact: true }).first()).toBeVisible();

    await cloudflareTab.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: /ระดับการสเกล|Scale Tier/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(cloudflareTab).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "Redis" }).click();
    const cacheToggle = page.getByRole("switch", { name: /ใช้ Cloudflare KV/i });
    if (await cacheToggle.count()) await expect(cacheToggle).toBeDisabled();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    await expect(page.locator("body")).not.toContainText("Bearer ");
    expect(pageErrors).toEqual([]);
    await page.screenshot({
      path: `test-results/cloudflare-search-cache/${viewport.name}.png`,
      fullPage: true,
    });
  });
}
