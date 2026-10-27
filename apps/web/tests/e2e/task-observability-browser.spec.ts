import { expect, test, type Page } from "@playwright/test";

function trpcData(data: unknown) {
  return JSON.stringify({ result: { data: { json: data } } });
}

function procedureName(url: string): string {
  return new URL(url).pathname.replace(/^\/trpc\//, "").split(",")[0] ?? "";
}

async function mockTaskControlRoutes(page: Page) {
  const task = {
    id: "browser-task-1",
    jobType: "spec224.development",
    status: "running",
    stage: "IMPLEMENT",
    attempt: 1,
    maxAttempts: 2,
    heartbeatAt: null,
    createdAt: "2026-10-27T00:00:00Z",
    updatedAt: "2026-10-27T00:01:00Z",
    workerId: null,
    runnerId: "browser-runner-1",
    runnerSessionState: "running",
    projectId: null,
    specId: null,
    identityBinding: { status: "UNKNOWN", source: null },
    operatorAttention: { required: false, reason: null },
    recovery: { nextRetryAt: null, retryEligible: false, runnerSessionState: null },
  };
  const detail = {
    ...task,
    heartbeatFreshness: "unknown",
    runner: { displayName: "Browser runner", status: "online", freshness: "fresh" },
    identityBinding: { status: "UNKNOWN", source: null },
    modelSelection: { uiSessionModel: null, source: "unknown", asOf: "2026-10-27T00:01:00Z", rationale: null },
    operatorAttention: { required: false, reason: null },
    recovery: { retryEligible: false, nextRetryAt: null, runnerSessionState: null },
    goal: {
      status: "BASELINE_MISSING",
      reason: "trusted_baseline_missing",
      verifiedGoalCompletion: { percent: null, rawPercent: null, requiredCriteriaComplete: false },
      executionProgress: { percent: null },
      implementationCompletion: { percent: null },
      workCompletion: { percent: null },
      evidenceCoverage: { coveredCriteria: 0, totalCriteria: 0 },
      remainingScope: [],
      blockedScope: [],
    },
    usage: {
      coverage: { status: "PARTIAL", reason: "Only linked task evidence is shown." },
      counts: { unique: 0, corrections: 0, replayed: 0, missing: 0, conflicts: 0, overlap: 0 },
      completeTotalTokens: null,
      knownSubtotalTokens: 0,
      coverageReason: "No linked usage receipts.",
      receipts: [],
      reservations: [],
      settlementMarkers: [],
      economicSettlements: [],
      settlements: [],
    },
    quotaCoverage: { status: "UNKNOWN", reason: "No linked quota observation." },
    timeline: [],
  };

  await page.route("**/trpc/**", async route => {
    const procedure = procedureName(route.request().url());
    let data: unknown = null;
    if (procedure === "auth.me") {
      data = {
        id: 201,
        email: "task-control-browser@smartspec.local",
        name: "Task Control Browser",
        role: "user",
        currentTenantId: "tenant-task-control-browser",
        credits: 100,
      };
    } else if (procedure === "workerJobs.observability") {
      data = {
        scope: "owner",
        items: [task],
        snapshot: {
          asOf: "2026-10-27T00:01:00Z",
          expiresAt: "2026-10-27T00:10:00Z",
          projectionToken: "browser-snapshot",
          consistency: "created_at_watermark_live_state",
        },
        nextCursor: null,
      };
    } else if (procedure === "workerJobs.observabilityDetail") {
      data = detail;
    } else if (procedure === "workerJobs.observabilityAggregate") {
      data = null;
    } else if (procedure === "runnerNodes.list") {
      data = { runners: [] };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: trpcData(data) });
  });
}

test("Task Control Simple and Developer views share evidence and fit common viewport sizes", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("smartspec_locale", "en");
    localStorage.setItem("smartspec_locale_chosen", "true");
  });
  await mockTaskControlRoutes(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agent-monitor");
  await expect(page.locator("h1")).toContainText("Task Control");
  await expect(page.getByText("Verified progress: Unknown · trusted_baseline_missing")).toBeVisible();
  await expect(page.getByText("No final deliverable references are recorded in this task view.")).toBeVisible();
  await page.getByRole("radio", { name: "Developer" }).click();
  await expect(page.getByText(/live terminal stream, file diffs and harness identity are not exposed/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Task detail" })).toBeVisible();
  await page.getByRole("radio", { name: "Simple" }).click();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("h1")).toContainText("Task Control");
    const dimensions = await page.evaluate(() => ({ viewportWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  }
});
