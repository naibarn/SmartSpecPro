import { expect, test, type Page } from "@playwright/test";

const TEST_IDENTITY = {
  id: 30801,
  email: "spec-308-browser@smartspec.local",
  name: "SPEC-308 Browser",
  role: "user",
  currentTenantId: "tenant-spec-308-browser",
  credits: 100,
};

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

function procedureName(url: string): string {
  return new URL(url).pathname.replace(/^\/trpc\//, "").split(",")[0] ?? "";
}

async function mockAuthenticatedApi(page: Page) {
  await page.route("**/api/tenant/current", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tenant: { id: TEST_IDENTITY.currentTenantId, featureFlags: { livingMascotDualSurface: true } } }),
  }));
  await page.route("**/trpc/**", async route => {
    const procedure = procedureName(route.request().url());
    let data: unknown = null;
    if (procedure === "auth.me") data = TEST_IDENTITY;
    else if (procedure === "tenant.current") {
      data = { tenant: { id: TEST_IDENTITY.currentTenantId, featureFlags: { livingMascotDualSurface: true } } };
    } else if (procedure === "tenantFeatureFlags.getFeatureFlags") {
      data = { livingMascotDualSurface: true };
    } else if (procedure === "chat.listConversations" || procedure === "chat.listTrashedConversations") {
      data = { conversations: [] };
    } else if (procedure === "chat.createConversation") {
      data = { id: 30801, title: "SPEC-308 test conversation" };
    } else if (procedure === "notifications.list") {
      data = { notifications: [], unreadCount: 0 };
    } else if (procedure === "scheduledMessages.getNotificationCount") {
      data = { count: 1 };
    } else if (procedure === "scheduledMessages.getNotifications") {
      data = [{ id: 30801, title: "Mock notification", content: "Generic test item", isRead: false }];
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: trpcData(data) });
  });
}

async function initializeAuthenticatedBrowser(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page);
}

test("SPEC-308 isolated authenticated simulation covers launcher, Chat, Feedback and draft preservation", async ({ page }) => {
  await initializeAuthenticatedBrowser(page, 390, 844);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/chat");
  const launcher = page.getByRole("button", { name: "Open AI Chat and Feedback" });
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toHaveAttribute("data-mascot-style", "droplet");
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await launcher.click();
  await expect(page.getByRole("heading", { name: "AI Chat & Feedback" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI Chat" })).toHaveAttribute("aria-selected", "true");
  await page.getByPlaceholder("Type a message or / for skills...").fill("unsent chat draft");
  await page.getByRole("tab", { name: "Task Control" }).click();
  await page.getByRole("tab", { name: "AI Chat" }).click();
  await expect(page.getByPlaceholder("Type a message or / for skills...")).toHaveValue("unsent chat draft");
  await page.getByRole("tab", { name: "Feedback" }).click();
  await page.getByPlaceholder("Title").fill("unsent feedback draft");
  await page.getByRole("tab", { name: "AI Chat" }).click();
  await page.getByRole("tab", { name: "Feedback" }).click();
  await expect(page.getByPlaceholder("Title")).toHaveValue("unsent feedback draft");
  await page.getByRole("tab", { name: "AI Chat" }).click();
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
});

for (const width of [320, 360, 390, 767, 768, 1440]) {
  test(`SPEC-308 authenticated simulation has no horizontal overflow at ${width}px`, async ({ page }) => {
    await initializeAuthenticatedBrowser(page, width, width < 768 ? 844 : 900);
    await page.goto("/chat");
    await expect(page.getByRole("button", { name: "Open AI Chat and Feedback" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: `../../orchestra/tasks/spec-308-20261009/evidence/screenshots/${width}x-authenticated-simulation.png`, fullPage: true });
  });
}
