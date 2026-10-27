import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

function procedureName(url: string): string {
  return new URL(url).pathname.replace(/^\/trpc\//, "").split(",")[0] ?? "";
}

async function mockControlPlaneRoutes(page: Page, onResume?: (body: string) => void) {
  await page.route("**/trpc/**", async route => {
    const procedure = procedureName(route.request().url());
    let data: unknown = null;
    if (procedure === "auth.me") {
      data = {
        id: 200,
        email: "control-plane-browser@smartspec.local",
        name: "Control Plane Browser",
        role: "user",
        currentTenantId: "tenant-control-plane",
        credits: 100,
      };
    } else if (procedure === "chat.listConversations") {
      data = { conversations: [] };
    } else if (procedure === "chat.listTrashedConversations") {
      data = { conversations: [] };
    } else if (procedure === "chat.createConversation") {
      data = { id: 2001, title: "New Chat" };
    } else if (procedure === "tenantFeatureFlags.getFeatureFlags") {
      data = { chatBrowserSessionEntry: false, liveBrowser: false };
    } else if (procedure === "spec226DevelopmentControl.availableWorkspaces") {
      data = { workspaces: [{ runnerId: "customer-runner-id", workspaceId: "customer-workspace-id", displayName: "SmartSpecPro", status: "online", snapshotRevision: "1" }] };
    } else if (procedure === "spec226DevelopmentControl.getConversationWorkspace") {
      data = { workspace: { runnerId: "customer-runner-id", workspaceId: "customer-workspace-id", revision: 1 },
        availability: { available: true, status: "current" }, specSet: null,
        developmentRuns: [{ runId: "run-existing-224", state: "BLOCKED_RECOVERABLE", workPackageId: "pkg-224",
          workPackageExternalId: "SPEC-224", specSetRevision: 1, revision: 2 }] };
    } else if (procedure === "spec226DevelopmentControl.resumeWorkspaceRun") {
      onResume?.(route.request().postData() ?? "");
      data = { runId: "run-existing-224", jobId: "job-existing-224", state: "BLOCKED_RECOVERABLE",
        dispatchStatus: "PENDING_AUTHORIZATION", resumedExistingRun: true,
        authorization: { status: "APPROVAL_REQUIRED", reasons: ["APPROVAL_REQUIRED"] } };
    } else if (procedure === "workerJobs.dashboardSummary") {
      data = {
        counts: {
          pending: 0,
          queued: 1,
          active: 1,
          running: 1,
          waitingExternal: 0,
          retryScheduled: 0,
          succeeded: 2,
          failed: 0,
          canceled: 0,
          expired: 0,
          stale: 0,
        },
        capacity: {
          workersTotal: 1,
          workersOnline: 1,
          workersStale: 0,
          freeSlots: 1,
          capacityKnown: true,
        },
        outbox: { pending: 0, failed: 0, quarantined: 0 },
        alerts: {
          hasIncident: false,
          capacityExhausted: false,
          capacityUnknown: false,
        },
      };
    } else if (procedure === "workerJobs.taskGroups") {
      data = {
        groups: [
          {
            groupId: "plan:browser-plan",
            groupKind: "plan",
            title: "Plan browser-plan",
            status: "running",
            progressPercent: 58,
            completedSteps: 1,
            totalSteps: 2,
            activeStepId: "browser-plan:step:2",
            metadataState: "clean",
            latestEvent: { message: "Agent is running", phase: "execution" },
            jobs: [
              {
                id: "job-browser-plan",
                jobType: "agent.plan",
                status: "succeeded",
                progressPercent: 100,
                progressPhase: "planned",
                canCancel: false,
                orchestration: {
                  stepId: "browser-plan:step:1",
                  stepIndex: 1,
                  totalSteps: 2,
                  dependsOnJobIds: [],
                },
                latestEvent: { message: "Plan ready", phase: "planned" },
                worker: null,
              },
              {
                id: "job-browser-1",
                jobType: "agent.task",
                status: "running",
                progressPercent: 16,
                progressPhase: "execution",
                canCancel: true,
                orchestration: {
                  stepId: "browser-plan:step:2",
                  stepIndex: 2,
                  totalSteps: 2,
                  dependsOnJobIds: ["job-browser-plan"],
                },
                latestEvent: {
                  message: "Agent is running",
                  phase: "execution",
                },
                worker: {
                  displayName: "Browser Worker",
                  machineName: null,
                },
              },
            ],
          },
        ],
        hasMore: false,
        nextOffset: 25,
        sourceTruncated: false,
      };
    } else if (procedure === "connectedDevices.list") {
      data = {
        devices: [
          {
            deviceId: "worker-browser-1",
            displayName: "Browser Worker",
            authKind: "worker_executor",
            status: "active",
            effectiveScopes: ["jobs:execute"],
          },
        ],
      };
    } else if (procedure === "runnerNodes.list") {
      data = {
        runners: [
          {
            runnerId: "customer-runner-id",
            displayName: "My Runner",
            profile: "local_device",
            nodeKind: "local_device",
            status: "online",
            trustState: "trusted",
            displayState: "ready",
            toolCount: 0,
            capabilityCount: 0,
            workspaceCount: 1,
            workspaces: [{
              provenance: "user_owned",
              displayName: "SmartSpecPro",
              workspaceId: "customer-workspace-id",
              projectId: "customer-project-id",
              repositoryId: "customer/repository",
              gitHead: "a".repeat(40),
              gitBranch: "main",
              dirty: false,
            }],
            toolInventory: [],
            capabilityInventory: [],
          },
          {
            runnerId: "platform-runner-internal-id",
            displayName: "SmartAIHub Runner",
            profile: "shared_container",
            nodeKind: "managed_container",
            status: "online",
            trustState: "trusted",
            displayState: "ready",
            toolCount: 0,
            capabilityCount: 0,
            workspaceCount: 1,
            workspaces: [{
              provenance: "platform_internal",
              displayName: "Runner workspace",
            }],
            toolInventory: [],
            capabilityInventory: [],
          },
        ],
      };
    } else if (procedure === "mcpConnections.listConnections") {
      data = [
        {
          id: "mcp-browser-1",
          displayName: "Browser MCP",
          providerDisplayName: "Browser MCP",
          status: "connected",
          connectionScope: "personal",
          allowedAssetTypes: ["image"],
        },
      ];
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: trpcData(data),
    });
  });
}

test("continues the selected SPEC-224 run without sending another Start", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  let resumeBody = "";
  await mockControlPlaneRoutes(page, body => { resumeBody = body; });
  await page.goto("/chat?panel=control-plane&view=full&c=233");

  const panel = page.getByTestId("control-plane-panel");
  await expect(panel).toBeVisible();
  const continueButton = panel.getByRole("button", { name: "ทำงานเดิมต่อ" });
  await expect(continueButton).toBeVisible();
  await continueButton.click();
  await expect.poll(() => resumeBody).toContain("run-existing-224");
  await expect(page.getByText(/DevelopmentRun เดิมยังรอ authorization/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "ทำงานเดิมต่อ" })).toBeVisible();
});

for (const viewport of VIEWPORTS) {
  test(`Task Control Center is reachable and responsive at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.addInitScript(() => {
      localStorage.setItem("smartspec_locale", "en");
      localStorage.setItem("smartspec_locale_chosen", "true");
    });
    await mockControlPlaneRoutes(page);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const requestErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", request =>
      requestErrors.push(
        `${request.url()}: ${request.failure()?.errorText ?? "failed"}`
      )
    );
    const response = await page.goto("/chat?panel=control-plane");
    await page.waitForTimeout(2_000);

    const panel = page.getByTestId("control-plane-panel");
    if (!(await panel.count()) && viewport.width < 1024) {
      await page.getByRole("button", { name: "Open AI Chat & Feedback" }).click();
      await page.getByRole("tab", { name: "Task Control" }).click();
    }
    if (!(await panel.count())) {
      throw new Error(
        `Task Control Center did not render. Status: ${response?.status()} URL: ${page.url()} PageErrors: ${pageErrors.join(" | ")} ConsoleErrors: ${consoleErrors.join(" | ")} RequestErrors: ${requestErrors.join(" | ")} Body: ${await page.locator("body").innerText()} HTML: ${(await page.content()).slice(0, 500)}`
      );
    }
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: "Task Control Center" })
    ).toBeVisible();
    await expect(panel.getByText("Browser Worker")).toBeVisible();
    await expect(panel.getByText("Browser MCP", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Expand runner My Runner" }).click();
    await expect(panel.getByLabel("Workspace source status").getByText("SmartSpecPro", { exact: true })).toBeVisible();
    await expect(panel.getByText(/customer-project-id|customer\/repository/)).toHaveCount(0);
    await panel.getByRole("button", { name: "Show developer workspace details" }).click();
    await expect(panel.getByText(/customer-project-id/)).toHaveCount(2);
    await expect(panel.getByText(/customer\/repository/)).toHaveCount(2);
    await panel.getByRole("button", { name: "Expand runner SmartAIHub Runner" }).click();
    await expect(panel.getByLabel("Workspace source status").getByText("Runner workspace", { exact: true })).toBeVisible();
    await expect(panel.getByText(/platform-runner-internal-id|internal repository/)).toHaveCount(0);
    await panel.getByRole("button", { name: "Hide developer workspace details" }).click();
    await panel
      .getByRole("button", { name: "Expand task Plan browser-plan" })
      .click();
    await expect(panel.getByText("Step 1/2 · agent.plan")).toBeVisible();
    await expect(panel.getByText("Step 2/2 · agent.task")).toBeVisible();
    await expect(panel.getByText("agent.task")).toBeVisible();
    await expect(
      panel.getByRole("progressbar", { name: "Step 2/2 progress" })
    ).toHaveAttribute("aria-valuenow", "16");

    await panel
      .getByRole("button", { name: "Close Task Control Center" })
      .click();
    await expect(page.getByTestId("control-plane-panel")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Open AI Chat & Feedback" })
      .click();
    await expect(
      page.getByRole("heading", { name: "AI Chat & Feedback" })
    ).toBeVisible();
    const urlBeforeHelpPanel = page.url();
    await expect(page.getByRole("tab", { name: "AI Chat" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(
      page.getByPlaceholder("Type a message or / for skills...")
    ).toBeVisible();
    expect(page.url()).toBe(urlBeforeHelpPanel);
    await page.getByRole("tab", { name: "Task Control" }).click();
    await expect(page.getByTestId("control-plane-panel")).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth + 1
    );
    await page.screenshot({
      path: `/tmp/smartspec-control-plane-${viewport.name}.png`,
      fullPage: true,
    });

    const task = `Review the control plane from ${viewport.name}`;
    await panel.getByLabel("Task instructions").fill(task);
    await panel.getByRole("button", { name: "Add to chat composer" }).click();
    await expect(
      page.getByPlaceholder("Type a message or / for skills...")
    ).toHaveValue(task);
  });
}

test("the single AI Chat and Feedback entry works outside the Chat route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockControlPlaneRoutes(page);

  await page.goto("/dashboard");
  const button = page.getByRole("button", {
    name: "Open AI Chat & Feedback",
  });
  await expect(button).toBeVisible();
  const urlBeforeOpen = page.url();
  await button.click();
  await expect(
    page.getByRole("heading", { name: "AI Chat & Feedback" })
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Type a message or / for skills...")
  ).toBeVisible();
  expect(page.url()).toBe(urlBeforeOpen);
});
