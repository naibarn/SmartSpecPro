import { expect, test, type Page } from "@playwright/test";

const TEST_IDENTITY = {
  id: 30801,
  email: "spec-308-side-effects@smartspec.local",
  name: "SPEC-308 Side Effects",
  role: "user",
  currentTenantId: "tenant-spec-308-side-effects",
  credits: 100,
};

type CapturedRequest = { method: string; pathname: string };

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

function procedureName(url: string) {
  return new URL(url).pathname.replace(/^\/trpc\//, "").split(",")[0] ?? "";
}

function isForbiddenSideEffect(request: CapturedRequest) {
  const target = `${request.method} ${request.pathname}`.toLowerCase();
  return (
    /(?:^|[/.])(?:notifications?|scheduledmessages?)[/.].*(?:mark.*read|read.*mark|approve|dismiss|acknowledge)/i.test(target) ||
    /(?:^|[/.])(?:chat\.(?:createconversation|sendmessage|generate)|feedback\.submit|(?:llm|tools?|mcp)\.)/i.test(target) ||
    /(?:\.|\/)(?:approve|approval|sendmessage|createconversation|generatellm|calltool|executetool|reservecredits|deductcredits|credits?|credittransactions?|billing\.charge)(?:\.|\/|\?|$)/i.test(target) ||
    /(?:\/api\/[^?]*(?:feedback|approval|approve|llm|completion|tool|mcp|credit)|\bcredits?\b)/i.test(target)
  );
}

function isForbiddenProcedure(procedure: string) {
  return /(?:^(?:notifications?|scheduledMessages)\.(?:mark.*read|read.*mark|approve|dismiss|acknowledge)|^chat\.(?:createConversation|sendMessage|generate)|^feedback\.submit|(?:^|\.)(?:llm|tools?|mcp|agents?)(?:\.|$)|(?:^|\.)(?:approve|approval|sendMessage|createConversation|generate|callTool|executeTool|reserveCredits|deductCredits|credits?|creditTransactions?|billing\.charge)(?:\.|$))/i.test(procedure);
}

async function mockAuthenticatedApi(page: Page, procedures: string[]) {
  await page.route("**/api/tenant/current", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      tenant: {
        id: TEST_IDENTITY.currentTenantId,
        featureFlags: { livingMascotDualSurface: true },
      },
    }),
  }));
  await page.route("**/trpc/**", async route => {
    const procedure = procedureName(route.request().url());
    procedures.push(procedure);
    let data: unknown = null;
    if (procedure === "auth.me") data = TEST_IDENTITY;
    else if (procedure === "tenant.current") {
      data = {
        tenant: {
          id: TEST_IDENTITY.currentTenantId,
          featureFlags: { livingMascotDualSurface: true },
        },
      };
    } else if (procedure === "tenantFeatureFlags.getFeatureFlags") {
      data = { livingMascotDualSurface: true };
    } else if (["chat.listConversations", "chat.listTrashedConversations"].includes(procedure)) {
      data = { conversations: [] };
    } else if (procedure === "notifications.list") {
      data = { notifications: [], unreadCount: 1 };
    } else if (procedure === "scheduledMessages.getNotificationCount") {
      data = { count: 1 };
    } else if (procedure === "scheduledMessages.getNotifications") {
      data = [{ id: 30801, title: "Mock notification", content: "Generic test item", isRead: false }];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: trpcData(data),
    });
  });
}

test("SPEC-308 demo balloon show, dismiss and CTA do not cause authoritative side effects", async ({ page }) => {
  const procedures: string[] = [];
  const requests: CapturedRequest[] = [];
  let externalRequestCount = 0;

  page.on("request", request => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      externalRequestCount += 1;
    }
    requests.push({ method: request.method(), pathname: url.pathname });
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
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
    class MockEventSource {
      addEventListener() {}
      close() {}
    }
    (globalThis as typeof globalThis & { EventSource: typeof EventSource }).EventSource = MockEventSource as unknown as typeof EventSource;
  });
  await mockAuthenticatedApi(page, procedures);

  await page.goto("/settings?tab=notifications");
  await expect(page.getByTestId("assistant-appearance-preferences")).toBeVisible();
  const demoButton = page.getByRole("button", { name: "Demo reminder balloon" });
  const balloon = page.locator(".assistant-reminder-balloon");
  await expect(page.getByTestId("global-notification-bell")).toBeVisible();

  // Ignore the ordinary authenticated page bootstrap. All assertions below
  // concern requests caused after the demo interaction begins.
  const requestBaseline = requests.length;
  const procedureBaseline = procedures.length;
  const expectNoSideEffectsSinceBaseline = () => {
    expect(requests.slice(requestBaseline).filter(isForbiddenSideEffect)).toEqual([]);
    expect(procedures.slice(procedureBaseline).filter(isForbiddenProcedure)).toEqual([]);
  };

  await demoButton.click();
  await expect(balloon).toBeVisible();
  expectNoSideEffectsSinceBaseline();
  expect(externalRequestCount).toBe(0);

  await balloon.getByRole("button", { name: "Dismiss reminder" }).click();
  await expect(balloon).toHaveCount(0);
  expectNoSideEffectsSinceBaseline();

  await demoButton.click();
  await expect(balloon).toBeVisible();
  const bellButton = page.getByTestId("global-notification-bell").locator('button[aria-controls="global-notification-popover"]');
  await balloon.getByRole("button", { name: /View notifications|assistantAppearance.viewNotifications/ }).click();
  await expect(bellButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Mock notification")).toBeVisible();
  await expect(balloon).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "AI Chat & Feedback" })).toHaveCount(0);
  expectNoSideEffectsSinceBaseline();

  // The CTA is allowed to open the existing notification surface. These
  // deterministic mocked interactions are not live authenticated acceptance.
});
