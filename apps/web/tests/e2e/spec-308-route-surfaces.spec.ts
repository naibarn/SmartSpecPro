import { expect, test, type Page } from "@playwright/test";

const MOCK_IDENTITY = {
  id: 30802,
  email: "spec-308-route-surface@smartspec.local",
  name: "SPEC-308 Route Surface",
  role: "user",
  currentTenantId: "tenant-spec-308-route-surface",
  credits: 100,
};

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

function procedureName(url: string) {
  return new URL(url).pathname.replace(/^\/trpc\//, "").split(",")[0] ?? "";
}

async function installRouteFixtures(page: Page, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
    class MockEventSource {
      addEventListener() {}
      close() {}
    }
    (globalThis as any).EventSource = MockEventSource;
  });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (route.request().resourceType() === "document") {
        return route.fetch().then(async response => {
          const html = (await response.text()).replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi, "");
          return route.fulfill({ response, body: html });
        });
      }
      return route.continue();
    }
    return route.abort("blockedbyclient");
  });
  await page.route("**/api/tenant/current", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tenant: { id: MOCK_IDENTITY.currentTenantId, featureFlags: { livingMascotDualSurface: true } } }),
  }));
  await page.route("**/trpc/**", route => {
    const procedure = procedureName(route.request().url());
    let data: unknown = null;
    if (procedure === "auth.me") data = MOCK_IDENTITY;
    else if (procedure === "tenant.current") {
      data = { tenant: { id: MOCK_IDENTITY.currentTenantId, featureFlags: { livingMascotDualSurface: true } } };
    } else if (procedure === "tenantFeatureFlags.getFeatureFlags") data = { livingMascotDualSurface: true };
    else if (procedure === "scheduledMessages.getNotificationCount") data = { count: 1 };
    else if (procedure === "scheduledMessages.getNotifications") {
      data = [{ id: 30802, title: "Mock route notification", content: "Fixture only", isRead: false }];
    } else if (procedure === "scheduledMessages.getNotificationHistory") {
      data = { items: [{
        id: 30802,
        title: "Mock route notification",
        content: "Fixture only",
        isRead: false,
        priority: "normal",
        type: "system",
        createdAt: "2030-01-01T00:00:00.000Z",
        occurrenceCount: 1,
      }], total: 1 };
    } else if (procedure === "chat.listConversations" || procedure === "chat.listTrashedConversations") {
      data = { conversations: [] };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: trpcData(data) });
  });
}

async function expectSurfacesDoNotOverlap(page: Page, viewportWidth = 390) {
  const bell = page.getByTestId("global-notification-bell").getByRole("button");
  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
  await expect(bell).toBeVisible();
  await expect(launcher).toBeVisible();
  const [bellRect, launcherRect] = await Promise.all([bell.boundingBox(), launcher.boundingBox()]);
  expect(bellRect).not.toBeNull();
  expect(launcherRect).not.toBeNull();
  expect(bellRect!.x + bellRect!.width <= launcherRect!.x
    || launcherRect!.x + launcherRect!.width <= bellRect!.x
    || bellRect!.y + bellRect!.height <= launcherRect!.y
    || launcherRect!.y + launcherRect!.height <= bellRect!.y).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
}

test.describe("SPEC-308 route surface simulations", () => {
  test("mobile Notifications route keeps the page, Bell, and launcher usable together", async ({ page }) => {
    await installRouteFixtures(page);
    await page.goto("/notifications");

    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
    await expect(page.getByText("Mock route notification")).toBeVisible();
    await expectSurfacesDoNotOverlap(page);

    const bell = page.getByTestId("global-notification-bell").getByRole("button");
    await bell.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Mock route notification")).toBeVisible();
  });

  test("mobile presentation editor route retains global surfaces while loading the route", async ({ page }) => {
    await installRouteFixtures(page);
    await page.goto("/presentation-editor/30802");

    // The fixture does not fabricate a library item or deck. The real route's
    // unavailable-item state is the expected editor shell for this unknown id.
    await expect(page.getByRole("heading", { name: /unavailable|presentation/i })).toBeVisible();
    await expectSurfacesDoNotOverlap(page);
  });

  test("reduced layout viewport and rotated landscape keep Bell and launcher visible", async ({ page }) => {
    // A 720 CSS-pixel viewport represents a 1440px desktop at 200% browser zoom.
    await installRouteFixtures(page, 720, 450);
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
    await expectSurfacesDoNotOverlap(page, 720);

    await page.setViewportSize({ width: 450, height: 720 });
    await expectSurfacesDoNotOverlap(page, 450);
    await page.getByRole("button", { name: "Open AI Chat & Feedback" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "AI Chat & Feedback" })).toBeVisible();
  });

  test("decorative balloon yields to fixed controls and returns when clear", async ({ page }) => {
    await installRouteFixtures(page);
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("smartspec:show-assistant-mascot-demo")));

    const balloon = page.locator(".assistant-reminder-balloon");
    const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
    await expect(launcher).toBeVisible();
    await expect(balloon).toBeVisible();
    await page.evaluate(() => {
      const launcher = document.querySelector<HTMLElement>("button[aria-label='Open AI Chat & Feedback']");
      const balloon = document.querySelector<HTMLElement>(".assistant-reminder-balloon");
      if (!launcher || !balloon) throw new Error("Expected the fixture launcher and demo balloon");
      const anchor = launcher.getBoundingClientRect();
      const hint = balloon.getBoundingClientRect();
      const left = hint.left;
      const positions = [anchor.top - hint.height - 8, anchor.bottom + 8];
      positions.forEach((top, index) => {
        const surface = document.createElement("section");
        surface.setAttribute("role", "toolbar");
        Object.assign(surface.style, {
          position: "fixed",
          left: `${left}px`,
          top: `${top}px`,
          width: `${hint.width}px`,
          height: `${hint.height}px`,
          zIndex: "9999",
        });
        const blocker = document.createElement("button");
        blocker.type = "button";
        blocker.setAttribute("aria-label", `Fixed collision fixture ${index + 1}`);
        surface.append(blocker);
        document.body.append(surface);
      });
    });
    await expect(balloon).toBeHidden();
    await expect(launcher).toBeVisible();
    await expect(page.getByTestId("global-notification-bell")).toBeVisible();

    await page.getByRole("button", { name: /Fixed collision fixture/ }).evaluateAll(elements => elements.forEach(element => element.closest("[role='toolbar']")?.remove()));
    await expect(balloon).toBeVisible();
  });
});
