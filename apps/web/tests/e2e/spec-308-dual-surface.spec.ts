import { expect, test, type Page } from "@playwright/test";
import {
  getSpec308SourceSha,
  installSpec308MetricsProbe,
  measureMascotSvgGzip,
  writeSpec308MetricsEvidence,
  type Spec308MetricsEvidence,
} from "./helpers/spec308-metrics";

const TEST_IDENTITY = {
  id: 30801,
  email: "spec-308-browser@smartspec.local",
  name: "SPEC-308 Browser",
  role: "user",
  currentTenantId: "tenant-spec-308-browser",
  credits: 100,
};

type TenantFlagFixture = { enabled: boolean };
const externalRequestsByPage = new WeakMap<Page, string[]>();

async function installMockEventSource(page: Page) {
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
    (window as any).__spec308NotificationBaselineReady = false;
    const dispatchEvent = window.dispatchEvent.bind(window);
    window.dispatchEvent = (event: Event) => {
      if (event.type === "smartspec:assistant-notification-baseline") {
        (window as any).__spec308NotificationBaselineReady = true;
      }
      return dispatchEvent(event);
    };
  });
}

async function waitForNotificationBaseline(page: Page) {
  await page.waitForFunction(() => (window as any).__spec308NotificationBaselineReady === true);
}

test.beforeEach(async ({ page }) => {
  const externalRequests: string[] = [];
  externalRequestsByPage.set(page, externalRequests);
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
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
});

test.afterEach(async ({ page }) => {
  expect(externalRequestsByPage.get(page) ?? []).toEqual([]);
});

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
  tenantFlagResponses: boolean[] = [],
) {
  await page.route("**/api/tenant/current", route => {
    tenantFlagResponses.push(tenantFlag.enabled);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tenant: { id: identity.currentTenantId, featureFlags: { livingMascotDualSurface: tenantFlag.enabled } } }),
    });
  });
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
  procedureLog: string[] = [],
) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, identity, procedureLog, tenantFlag);
}

test("SPEC-308 isolated authenticated simulation covers launcher, Chat, Feedback and draft preservation", async ({ page }) => {
  const procedures: string[] = [];
  await initializeAuthenticatedBrowser(page, 390, 844, TEST_IDENTITY, { enabled: true }, procedures);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/chat");
  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toHaveAttribute("data-mascot-style", "droplet");
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.className = "assistant-mascot-greeting-normal";
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
  await page.getByPlaceholder("Describe in detail...").fill("unsent feedback description");
  await page.getByRole("tab", { name: "AI Chat" }).click();
  await page.getByRole("tab", { name: "Feedback" }).click();
  await expect(page.getByPlaceholder("Title")).toHaveValue("unsent feedback draft");
  const sideEffectCallsBeforeHint = [...procedures].filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("smartspec:show-assistant-mascot-demo")));
  await expect(page.locator(".assistant-reminder-balloon, .assistant-chat-onboarding-hint")).toHaveCount(0);
  await expect(page.getByPlaceholder("Title")).toHaveValue("unsent feedback draft");
  await expect(page.getByPlaceholder("Describe in detail...")).toHaveValue("unsent feedback description");
  expect(procedures.filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  )).toEqual(sideEffectCallsBeforeHint);
  await page.getByRole("tab", { name: "AI Chat" }).click();
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
});

test("SPEC-308 notification popover stays inside a narrow viewport and restores keyboard focus", async ({ page }) => {
  await initializeAuthenticatedBrowser(page, 320, 720);
  await installMockEventSource(page);
  await page.goto("/dashboard");

  const bell = page.getByTestId("global-notification-bell").getByRole("button");
  await expect(bell).toBeVisible();
  await bell.click();
  const popover = page.getByRole("dialog");
  await expect(popover).toBeVisible();
  const bounds = await popover.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(320);
  expect(bounds.bottom).toBeLessThanOrEqual(720);

  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(bell).toBeFocused();
});

test("SPEC-308 tenant flag rollback preserves open Chat and Feedback drafts and actions", async ({ page }) => {
  const procedures: string[] = [];
  const tenantFlagResponses: boolean[] = [];
  const tenantFlag = { enabled: true };
  await page.clock.install();
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, TEST_IDENTITY, procedures, tenantFlag, tenantFlagResponses);
  await page.goto("/chat");

  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
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

  // Return focus after the shared tenant/current query becomes stale. This
  // exercises TanStack Query's supported focus refetch without reloading or
  // unmounting the dialog; fixed wall time does not run polling intervals.
  page.clock.setFixedTime(new Date(Date.now() + 61_000));
  tenantFlag.enabled = false;
  const mutationCallsBeforeRefresh = [...procedures].filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  );
  // Mount another observer of the shared tenant query via SPA navigation.
  // This deterministically refetches stale data without reloading the app or
  // unmounting the global Chat & Feedback dialog that owns the drafts.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/settings?tab=notifications");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect.poll(() => tenantFlagResponses[tenantFlagResponses.length - 1]).toBe(false);

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tab", { name: "Feedback" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByPlaceholder("Title")).toHaveValue(feedbackTitle);
  await expect(page.getByPlaceholder("Describe in detail...")).toHaveValue(feedbackDescription);
  await expect(page.getByRole("button", { name: "Submit Feedback" })).toBeEnabled();

  await page.getByRole("tab", { name: "AI Chat" }).click();
  await expect(page.getByPlaceholder("Type a message or / for skills...")).toHaveValue(chatDraft);
  await expect(page.getByRole("tab", { name: "Task Control" })).toBeVisible();
  expect(procedures.filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  )).toEqual(mutationCallsBeforeRefresh);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(launcher.locator("svg.lucide-message-square-plus")).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toHaveCount(0);
  // This is a deterministic mock API simulation. The route transition may
  // re-read queries; it must not create a conversation, submit feedback, or
  // mark a notification read as a side effect of the tenant presentation rollback.
});

for (const width of [320, 360, 390, 767, 768, 1440]) {
  test(`SPEC-308 authenticated simulation has no horizontal overflow at ${width}px`, async ({ page }) => {
    await initializeAuthenticatedBrowser(page, width, width < 768 ? 844 : 900);
    await page.goto("/chat");
    const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
    await expect(launcher).toBeVisible();
    const launcherBox = await launcher.boundingBox();
    const bellBox = await page.getByTestId("global-notification-bell").locator("button").boundingBox();
    expect(launcherBox?.height).toBeGreaterThanOrEqual(44);
    expect(launcherBox?.width).toBeGreaterThanOrEqual(44);
    expect(bellBox?.height).toBeGreaterThanOrEqual(44);
    expect(bellBox?.width).toBeGreaterThanOrEqual(44);
    if (width >= 768) await expect(page.getByText("AI Chat & Feedback")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: `../../orchestra/tasks/spec-308-20261009/evidence/screenshots/${width}x-authenticated-simulation.png`, fullPage: true });
  });
}

test("SPEC-308 unauthorised SSE stays decorative-static and retains Bell action", async ({ page }) => {
  await installMockEventSource(page);
  await initializeAuthenticatedBrowser(page, 1024, 900);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/chat");
  const bell = page.getByTestId("global-notification-bell");
  await expect(bell).toBeVisible();
  await expect(page.getByRole("button", { name: "Open AI Chat & Feedback" }).locator("[data-mascot-style]")).toBeVisible();
  await waitForNotificationBaseline(page);
  await page.evaluate(() => (window as any).__spec308EmitNotification({
    id: 30802,
    title: "Private notification title",
    content: "Private notification body",
  }));
  await expect(page.locator(".assistant-bell-ring-subtle, .assistant-bell-ring-normal")).toHaveCount(0);
  await bell.locator("button").click();
  await expect(page.getByText("Mock notification")).toBeVisible();
});

test("SPEC-308 configured normal motion does not animate unverified SSE", async ({ page }) => {
  await installMockEventSource(page);
  await page.addInitScript(() => {
    localStorage.setItem("assistant-mascot:v2:tenant-spec-308-browser:30801", JSON.stringify({
      version: 2,
      enabled: true,
      style: "droplet",
      motion: "normal",
      notificationReminders: true,
      chatOnboarding: false,
    }));
  });
  await initializeAuthenticatedBrowser(page, 1024, 900);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/chat");
  await expect(page.getByTestId("global-notification-bell")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open AI Chat & Feedback" }).locator("[data-mascot-style]")).toBeVisible();
  await waitForNotificationBaseline(page);
  await page.evaluate(() => (window as any).__spec308EmitNotification({ id: 30804 }));
  await expect(page.locator(".assistant-bell-ring-subtle, .assistant-bell-ring-normal")).toHaveCount(0);
});

test("SPEC-308 manual motion off disables decorative balloon entrance", async ({ page }) => {
  await installMockEventSource(page);
  await page.addInitScript(() => {
    localStorage.setItem("assistant-mascot:v2:tenant-spec-308-browser:30801", JSON.stringify({
      version: 2,
      enabled: true,
      style: "droplet",
      motion: "off",
      notificationReminders: true,
      chatOnboarding: true,
    }));
  });
  await initializeAuthenticatedBrowser(page, 390, 844);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/chat");
  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toBeVisible();
  await waitForNotificationBaseline(page);
  await page.evaluate(() => window.dispatchEvent(new Event("smartspec:show-assistant-mascot-demo")));
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(balloon).toBeVisible();
  await expect.poll(() => balloon.evaluate(node => getComputedStyle(node).animationName)).toBe("none");
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
  for (const style of ["Smart Drop", "Smart Spark", "Smart Shield", "Smart Chat", "Smart Orbit"]) {
    await expect(appearance.getByRole("radio", { name: style, exact: true })).toBeVisible();
  }
  await appearance.getByRole("radio", { name: "Smart Orbit", exact: true }).click();
  await expect(appearance.getByRole("radio", { name: "Smart Orbit", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(procedures.filter(procedure => procedure.startsWith("notificationPreferences.") && !procedure.endsWith("getPreferences"))).toEqual([]);

  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
  for (const [style, label] of [
    ["droplet", "Smart Drop"],
    ["star", "Smart Spark"],
    ["shield", "Smart Shield"],
    ["chat", "Smart Chat"],
    ["orbit", "Smart Orbit"],
  ]) {
    await appearance.getByRole("radio", { name: label, exact: true }).click();
    await expect(launcher.locator("[data-mascot-style]")).toHaveAttribute("data-mascot-style", style);
    await launcher.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "AI Chat & Feedback" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "AI Chat" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Task Control" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Feedback" })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  }

  await appearance.getByRole("radio", { name: "Smart Orbit", exact: true }).click();
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
  await expect(page.getByRole("radio", { name: "Smart Drop", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("assistant-mascot:v2:tenant-spec-308-other:30801"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("assistant-mascot:v2:tenant-spec-308-browser:30801")).then(value => JSON.parse(value ?? "null").style)).toBe("orbit");
});

test("SPEC-308 demo balloon dismiss is presentation-only", async ({ page }) => {
  await page.clock.install();
  const procedures: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page, TEST_IDENTITY, procedures);
  await page.goto("/settings?tab=notifications");
  await expect(page.getByTestId("assistant-appearance-preferences")).toBeVisible();
  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
  await expect(launcher.locator("[data-mascot-style]")).toBeVisible();
  const callsBeforeDemo = [...procedures];
  await page.getByRole("button", { name: "Demo reminder balloon" }).click();
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(balloon).toBeVisible();
  expect(procedures).toEqual(callsBeforeDemo);
  // Leave a small scheduling margin around the UI event/effect boundary while
  // still asserting the three-second mobile dismissal window.
  await page.clock.fastForward(2_700);
  await expect(balloon).toBeVisible();
  await page.clock.fastForward(400);
  await expect(balloon).toHaveCount(0);
  await page.getByRole("button", { name: "Demo reminder balloon" }).click();
  await expect(balloon).toBeVisible();
  await balloon.getByRole("button", { name: "Dismiss reminder" }).click();
  await expect(balloon).toHaveCount(0);
  expect(procedures).toEqual(callsBeforeDemo);
  expect(procedures.filter(procedure => /notification.*(read|mark)|mark.*read/i.test(procedure))).toEqual([]);
  // This is an isolated mock API simulation; it does not prove authenticated live acceptance.
});

test("SPEC-308 unverified SSE does not replace demo hint and mascot still opens Chat", async ({ page }) => {
  await installMockEventSource(page);
  await page.clock.install();
  await initializeAuthenticatedBrowser(page, 390, 844);
  await page.goto("/chat");
  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toBeVisible();
  await waitForNotificationBaseline(page);
  await page.clock.pauseAt(new Date("2030-01-01T00:00:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("smartspec:show-assistant-mascot-demo")));
  await expect(balloon).toBeVisible();
  await page.evaluate(() => (window as any).__spec308EmitNotification({ id: 30805 }));
  await expect(balloon).toBeVisible();
  await page.clock.fastForward(2_100);
  await expect(balloon).toBeVisible();
  await expect(launcher.locator(".assistant-mascot-greeting-subtle")).toHaveCount(0);
  const launcherBox = await launcher.boundingBox();
  const balloonBox = await balloon.boundingBox();
  const launcherRight = launcherBox!.x + launcherBox!.width;
  const balloonRight = balloonBox!.x + balloonBox!.width;
  const nearestAlignedEdge = Math.min(Math.abs(launcherBox!.x - balloonBox!.x), Math.abs(launcherRight - balloonRight));
  expect(nearestAlignedEdge, `launcher=${JSON.stringify(launcherBox)} balloon=${JSON.stringify(balloonBox)}`).toBeLessThanOrEqual(24);
  expect(balloonBox!.x).toBeGreaterThanOrEqual(0);
  expect(balloonBox!.y).toBeGreaterThanOrEqual(0);
  expect(balloonBox!.x + balloonBox!.width).toBeLessThanOrEqual(390);
  expect(balloonBox!.y + balloonBox!.height).toBeLessThanOrEqual(844);
  await launcher.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(balloon).toHaveCount(0);
});

test("SPEC-308 reminder follows the launcher after drag and stays inside the viewport", async ({ page }) => {
  await installMockEventSource(page);
  await page.clock.install();
  await initializeAuthenticatedBrowser(page, 390, 844);
  await page.goto("/chat");
  const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("[data-mascot-style]")).toBeVisible();
  await waitForNotificationBaseline(page);
  await page.evaluate(() => window.dispatchEvent(new Event("smartspec:show-assistant-mascot-demo")));
  await expect(balloon).toBeVisible();
  const initialLauncher = await launcher.boundingBox();
  await page.mouse.move(initialLauncher!.x + initialLauncher!.width / 2, initialLauncher!.y + initialLauncher!.height / 2);
  await page.mouse.down();
  await page.mouse.move(180, 300, { steps: 4 });
  await expect(balloon).toHaveCount(0);
  await page.mouse.up();
  // FeedbackButton remeasures after the final launcher placement commits and
  // the remounted hint settles across two animation frames. The installed
  // Playwright clock controls rAF, so advance those frames before measuring.
  await page.clock.runFor(64);
  await expect(balloon).toBeVisible();
  let lastAlignment: { launcher: unknown; balloon: unknown; delta: number } | null = null;
  try {
    await expect.poll(async () => {
      const launcherBox = await launcher.boundingBox();
      const balloonBox = await balloon.boundingBox();
      if (!launcherBox || !balloonBox) return Number.POSITIVE_INFINITY;
      const delta = Math.abs(
        launcherBox.x + launcherBox.width / 2 - balloonBox.x - balloonBox.width / 2,
      );
      const balloonLayout = await balloon.evaluate(node => {
        const style = getComputedStyle(node);
        const viewport = window.visualViewport;
        return {
          rect: node.getBoundingClientRect().toJSON(),
          inlineLeft: (node as HTMLElement).style.left,
          inlineTop: (node as HTMLElement).style.top,
          computedLeft: style.left,
          computedTop: style.top,
          computedWidth: style.width,
          transform: style.transform,
          window: { width: window.innerWidth, height: window.innerHeight },
          visualViewport: viewport && {
            width: viewport.width,
            height: viewport.height,
            offsetLeft: viewport.offsetLeft,
            offsetTop: viewport.offsetTop,
            scale: viewport.scale,
          },
        };
      });
      lastAlignment = { launcher: launcherBox, balloon: balloonLayout, delta };
      return delta;
    }).toBeLessThanOrEqual(24);
  } catch (error) {
    throw new Error(`Post-drag launcher/balloon geometry: ${JSON.stringify(lastAlignment)}`, { cause: error });
  }
  const movedLauncher = await launcher.boundingBox();
  const movedBalloon = await balloon.boundingBox();
  expect(movedLauncher!.y).toBeLessThan(initialLauncher!.y - 100);
  expect(
    Math.abs(movedLauncher!.x + movedLauncher!.width / 2 - movedBalloon!.x - movedBalloon!.width / 2),
  ).toBeLessThanOrEqual(24);
  expect(movedBalloon!.x).toBeGreaterThanOrEqual(0);
  expect(movedBalloon!.y).toBeGreaterThanOrEqual(0);
  expect(movedBalloon!.x + movedBalloon!.width).toBeLessThanOrEqual(390);
  expect(movedBalloon!.y + movedBalloon!.height).toBeLessThanOrEqual(844);
});

test("SPEC-308 balloon CTA opens the existing notification Bell", async ({ page }) => {
  const procedures: string[] = [];
  await initializeAuthenticatedBrowser(page, 390, 844, TEST_IDENTITY, { enabled: true }, procedures);
  await page.goto("/settings?tab=notifications");
  await expect(page.getByTestId("assistant-appearance-preferences")).toBeVisible();
  await page.getByRole("button", { name: "Demo reminder balloon" }).click();
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(balloon).toBeVisible();
  const sideEffectsBeforeCta = [...procedures].filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  );
  await page.getByRole("button", { name: /View notifications|assistantAppearance.viewNotifications/ }).click();
  await expect(page.getByTestId("global-notification-bell")).toBeVisible();
  await expect(page.getByText("Mock notification")).toBeVisible();
  expect(procedures.filter(procedure =>
    /^(chat\.(createConversation|sendMessage)|feedback\.submit|scheduledMessages\.(mark|read))/i.test(procedure),
  )).toEqual(sideEffectsBeforeCta);
  // Deterministic simulated APIs prove only the CTA intent; no live auth acceptance is implied.
});

test("SPEC-308 Thai launcher and reminder labels are localized", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "th");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockAuthenticatedApi(page);
  await page.goto("/settings?tab=notifications");
  await expect(page.getByRole("button", { name: "เปิด AI Chat และ Feedback" })).toBeVisible();
  await page.getByRole("button", { name: "ทดลองบอลลูนเตือน" }).click();
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(balloon.getByText("มีแจ้งเตือนใหม่ อย่าลืมเข้าดู")).toBeVisible();
  await expect(balloon.getByRole("button", { name: "ดูแจ้งเตือน" })).toBeVisible();
  await page.getByRole("button", { name: "เปิด AI Chat และ Feedback" }).click();
  const dialog = page.getByRole("dialog", { name: "แชต AI และความคิดเห็น" });
  await expect(dialog.getByRole("tab", { name: "ควบคุมงาน" })).toBeVisible();
  await dialog.getByRole("tab", { name: "ส่งความคิดเห็น" }).click();
  await expect(dialog.getByPlaceholder("หัวข้อ")).toBeVisible();
  await expect(dialog.getByLabel("ส่งเป็นเรื่องเร่งด่วน")).toBeVisible();
});

test("SPEC-308 records raw OFF/ON network, heap, CLS, timer and mascot asset metrics", async ({ page }) => {
  const procedures: string[] = [];
  const tenantFlag: TenantFlagFixture = { enabled: false };
  await installMockEventSource(page);
  const metrics = await installSpec308MetricsProbe(page);
  try {
    await initializeAuthenticatedBrowser(page, 390, 844, TEST_IDENTITY, tenantFlag, procedures);
    await page.goto("/chat");
    await expect(page.getByTestId("global-notification-bell")).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const offCallCount = procedures.length;
    const flagOff = await metrics.snapshot("feature-flag-off", offCallCount);

    tenantFlag.enabled = true;
    await metrics.clearBrowserCache();
    await page.reload();
    const launcher = page.getByRole("button", { name: "Open AI Chat & Feedback" });
    await expect(launcher).toBeVisible();
    await expect(launcher.locator("[data-mascot-style]")).toBeVisible();
    await waitForNotificationBaseline(page);
    await page.evaluate(() => window.dispatchEvent(new Event("smartspec:show-assistant-mascot-demo")));
    await expect(page.locator(".assistant-reminder-balloon")).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const flagOnCallCount = procedures.length - offCallCount;
    const flagOn = await metrics.snapshot("feature-flag-on-with-demo-balloon", flagOnCallCount);

    const svg = measureMascotSvgGzip();
    const evidence: Spec308MetricsEvidence = {
      schemaVersion: 1,
      sourceSha: getSpec308SourceSha(),
      comparison: "same-build, same-browser, feature-flag OFF versus ON",
      acceptanceBoundary: "Mocked authenticated UI fixture only. This is not a main-versus-candidate commit comparison, live-network measurement, low-end device profile, or live acceptance.",
      thresholds: "not defined; no budget pass/fail is asserted",
      browser: {
        engine: "Chromium",
        userAgent: await page.evaluate(() => navigator.userAgent),
      },
      mascotSvg: svg,
      samples: [flagOff, flagOn],
    };
    await writeSpec308MetricsEvidence(evidence);
    expect(svg.variants).toHaveLength(5);
    expect(svg.variants.every(variant => variant.rawBytes > 0 && variant.gzipBytes > 0)).toBe(true);
    expect(evidence.samples.map(sample => sample.phase)).toEqual([
      "feature-flag-off",
      "feature-flag-on-with-demo-balloon",
    ]);
    expect(evidence.samples.every(sample => sample.heap.source === "chromium-cdp-proxy")).toBe(true);
    expect(evidence.samples.every(sample => Number.isFinite(sample.heap.jsHeapUsedBytes))).toBe(true);
    expect(evidence.samples.every(sample => Number.isFinite(sample.layout.cumulativeLayoutShift))).toBe(true);
  } finally {
    await metrics.close();
  }
});
