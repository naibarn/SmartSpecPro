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

async function mockAuthenticatedApi(page: Page, identity = TEST_IDENTITY) {
  await page.route("**/api/tenant/current", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tenant: { id: identity.currentTenantId, featureFlags: { livingMascotDualSurface: true } } }),
  }));
  await page.route("**/trpc/**", async route => {
    const procedure = procedureName(route.request().url());
    let data: unknown = null;
    if (procedure === "auth.me") data = identity;
    else if (procedure === "tenant.current") {
      data = { tenant: { id: identity.currentTenantId, featureFlags: { livingMascotDualSurface: true } } };
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

async function initializeAuthenticatedBrowser(page: Page, width: number, height: number, identity = TEST_IDENTITY) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, identity);
}

test("SPEC-308 isolated authenticated simulation covers launcher, Chat, Feedback and draft preservation", async ({ page }) => {
  await initializeAuthenticatedBrowser(page, 390, 844);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/chat");
  const launcher = page.getByRole("button", { name: "Open AI Chat and Feedback" });
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toHaveAttribute("data-mascot-style", "droplet");
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.className = "assistant-mascot-greeting";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = { animationName: style.animationName, animationDuration: style.animationDuration };
    probe.remove();
    return result;
  })).toMatchObject({ animationName: "none", animationDuration: "0s" });
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

test("SPEC-308 settings persist appearance per authenticated tenant and user", async ({ page }) => {
  await initializeAuthenticatedBrowser(page, 1024, 900);
  await page.goto("/settings?tab=notifications");
  const appearance = page.getByTestId("assistant-appearance-preferences");
  await expect(appearance).toBeVisible();
  await page.getByTestId("assistant-mascot-style-orbit").click();
  const preference = await page.evaluate(() => {
    const key = `assistant-mascot:v2:${encodeURIComponent("tenant-spec-308-browser")}:${encodeURIComponent("30801")}`;
    return { key, value: localStorage.getItem(key) };
  });
  expect(preference.key).toBe("assistant-mascot:v2:tenant-spec-308-browser:30801");
  expect(JSON.parse(preference.value ?? "null").style).toBe("orbit");
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("assistant-mascot:v2:")))).toEqual([preference.key]);

  const otherIdentity = { ...TEST_IDENTITY, currentTenantId: "tenant-spec-308-other" };
  await mockAuthenticatedApi(page, otherIdentity);
  await page.reload();
  await expect(page.getByTestId("assistant-mascot-style-droplet")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("assistant-mascot:v2:tenant-spec-308-other:30801"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("assistant-mascot:v2:tenant-spec-308-browser:30801")).then(value => JSON.parse(value ?? "null").style)).toBe("orbit");
});

test("SPEC-308 balloon CTA opens the existing notification Bell", async ({ page }) => {
  await initializeAuthenticatedBrowser(page, 390, 844);
  await page.goto("/settings?tab=notifications");
  await expect(page.getByTestId("assistant-appearance-preferences")).toBeVisible();
  await page.getByRole("button", { name: "Demo reminder balloon" }).click();
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(balloon).toBeVisible();
  await page.getByRole("button", { name: /View notifications|assistantAppearance.viewNotifications/ }).click();
  await expect(page.getByTestId("global-notification-bell")).toBeVisible();
  await expect(page.getByText("Mock notification")).toBeVisible();
});
