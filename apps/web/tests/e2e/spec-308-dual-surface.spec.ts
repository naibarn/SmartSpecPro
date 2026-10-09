import { expect, test, type Page } from "@playwright/test";

const TEST_IDENTITY = {
  id: 30801,
  email: "spec-308-browser@smartspec.local",
  name: "SPEC-308 Browser",
  role: "user",
  currentTenantId: "tenant-spec-308-browser",
  credits: 100,
};

type TenantFlagFixture = { enabled: boolean };

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

function procedureName(url: string): string {
  return new URL(url).pathname.replace(/^\/trpc\//, "").split(",")[0] ?? "";
}

async function mockAuthenticatedApi(
  page: Page,
  identity = TEST_IDENTITY,
  procedureLog: string[] = [],
  tenantFlag: TenantFlagFixture = { enabled: true },
) {
  await page.route("**/api/tenant/current", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tenant: { id: identity.currentTenantId, featureFlags: { livingMascotDualSurface: tenantFlag.enabled } } }),
  }));
  await page.route("**/trpc/**", async route => {
    const procedure = procedureName(route.request().url());
    procedureLog.push(procedure);
    let data: unknown = null;
    if (procedure === "auth.me") data = identity;
    else if (procedure === "tenant.current") {
      data = { tenant: { id: identity.currentTenantId, featureFlags: { livingMascotDualSurface: tenantFlag.enabled } } };
    } else if (procedure === "tenantFeatureFlags.getFeatureFlags") {
      data = { livingMascotDualSurface: tenantFlag.enabled };
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

async function initializeAuthenticatedBrowser(
  page: Page,
  width: number,
  height: number,
  identity = TEST_IDENTITY,
  tenantFlag: TenantFlagFixture = { enabled: true },
) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, identity, [], tenantFlag);
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

test("SPEC-308 tenant flag rollback preserves open Chat and Feedback drafts and actions", async ({ page }) => {
  const procedures: string[] = [];
  const tenantFlag = { enabled: true };
  await page.clock.install();
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, TEST_IDENTITY, procedures, tenantFlag);
  await page.goto("/chat");

  const launcher = page.getByRole("button", { name: "Open AI Chat and Feedback" });
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toBeVisible();
  await launcher.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "AI Chat & Feedback" })).toBeVisible();

  const chatDraft = "keep this chat draft through rollback";
  const feedbackTitle = "keep this feedback title through rollback";
  const feedbackDescription = "keep this feedback description through rollback";
  await page.getByPlaceholder("Type a message or / for skills...").fill(chatDraft);
  await page.getByRole("tab", { name: "Feedback" }).click();
  await page.getByPlaceholder("Title").fill(feedbackTitle);
  await page.getByPlaceholder("Describe in detail...").fill(feedbackDescription);
  await expect(page.getByRole("button", { name: "Submit Feedback" })).toBeEnabled();

  // Re-resolve only the mock tenant flag as the application does after focus
  // returns to a stale tenant/current query. Advancing fixed wall time does not
  // run notification polling intervals or discard the in-memory dialog state.
  page.clock.setFixedTime(new Date(Date.now() + 61_000));
  tenantFlag.enabled = false;
  const mutationCallsBeforeRefresh = [...procedures].filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  );
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect.poll(() => page.getByRole("button", { name: "Open AI Chat and Feedback" }).locator("[data-mascot-style]").count()).toBe(0);

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tab", { name: "Feedback" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByPlaceholder("Title")).toHaveValue(feedbackTitle);
  await expect(page.getByPlaceholder("Describe in detail...")).toHaveValue(feedbackDescription);
  await expect(page.getByRole("button", { name: "Submit Feedback" })).toBeEnabled();

  await page.getByRole("tab", { name: "AI Chat" }).click();
  await expect(page.getByPlaceholder("Type a message or / for skills...")).toHaveValue(chatDraft);
  await expect(page.getByRole("tab", { name: "Task Control" })).toBeVisible();
  await expect(launcher.locator("svg")).toBeVisible();
  expect(procedures.filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  )).toEqual(mutationCallsBeforeRefresh);
  // This is a deterministic mock API simulation. Focus refresh may re-read
  // queries; it must not create a conversation, submit feedback, or mark a
  // notification read as a side effect of the tenant presentation rollback.
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

test("SPEC-308 Bell animates for a new event and retains its existing action", async ({ page }) => {
  await page.addInitScript(() => {
    type Listener = (event: MessageEvent) => void;
    class MockEventSource {
      static current: MockEventSource | undefined;
      private listeners = new Map<string, Listener[]>();
      constructor() { MockEventSource.current = this; }
      addEventListener(type: string, listener: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      }
      close() {}
      emit(type: string, data: string) {
        for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data }));
      }
    }
    (globalThis as any).EventSource = MockEventSource;
    (window as any).__spec308EmitNotification = (data: unknown) =>
      MockEventSource.current?.emit("notification", JSON.stringify(data));
  });
  await initializeAuthenticatedBrowser(page, 1024, 900);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/chat");
  const bell = page.getByTestId("global-notification-bell");
  await expect(bell).toBeVisible();
  await page.evaluate(() => (window as any).__spec308EmitNotification({
    id: 30802,
    title: "Private notification title",
    content: "Private notification body",
  }));
  const ringingIcon = page.locator(".assistant-bell-ring");
  await expect(ringingIcon).toBeVisible();
  await expect.poll(() => ringingIcon.evaluate(node => getComputedStyle(node).animationName)).toBe("assistant-bell-ring");
  await bell.locator("button").click();
  await expect(page.getByText("Mock notification")).toBeVisible();
});

test("SPEC-308 settings expose five accessible choices and appearance changes stay local", async ({ page }) => {
  const procedures: string[] = [];
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, TEST_IDENTITY, procedures);
  await page.goto("/settings?tab=notifications");
  const appearance = page.getByTestId("assistant-appearance-preferences");
  await expect(appearance).toBeVisible();
  const styleChoices = appearance.getByRole("radiogroup", { name: "Mascot style" }).getByRole("radio");
  await expect(styleChoices).toHaveCount(5);
  for (const style of ["droplet", "star", "shield", "chat", "orbit"]) {
    await expect(appearance.getByRole("radio", { name: style, exact: true })).toBeVisible();
  }
  await appearance.getByRole("radio", { name: "orbit", exact: true }).click();
  await expect(appearance.getByRole("radio", { name: "orbit", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(procedures.filter(procedure => procedure.startsWith("notificationPreferences.") && !procedure.endsWith("getPreferences"))).toEqual([]);

  await appearance.getByRole("radio", { name: "orbit", exact: true }).click();
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
  await expect(page.getByRole("radio", { name: "droplet", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("assistant-mascot:v2:tenant-spec-308-other:30801"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("assistant-mascot:v2:tenant-spec-308-browser:30801")).then(value => JSON.parse(value ?? "null").style)).toBe("orbit");
});

test("SPEC-308 demo balloon dismiss is presentation-only", async ({ page }) => {
  const procedures: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, TEST_IDENTITY, procedures);
  await page.goto("/settings?tab=notifications");
  await expect(page.getByTestId("assistant-appearance-preferences")).toBeVisible();
  const callsBeforeDemo = [...procedures];
  await page.getByRole("button", { name: "Demo reminder balloon" }).click();
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(balloon).toBeVisible();
  expect(procedures).toEqual(callsBeforeDemo);
  await balloon.getByRole("button", { name: "Dismiss reminder" }).click();
  await expect(balloon).toHaveCount(0);
  expect(procedures).toEqual(callsBeforeDemo);
  expect(procedures.filter(procedure => /notification.*(read|mark)|mark.*read/i.test(procedure))).toEqual([]);
  // This is an isolated mock API simulation; it does not prove authenticated live acceptance.
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
