/** @vitest-environment jsdom */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { listQuery, detailQuery, runnerQuery, aggregateQuery, threadQuery, listArgs, detailArgs, aggregateArgs, aggregateOptions, setLocation, harnessOutput, conversationMessagesQuery } = vi.hoisted(() => ({
  listQuery: { current: {} as Record<string, unknown> },
  detailQuery: { current: {} as Record<string, unknown> },
  runnerQuery: { current: {} as Record<string, unknown> },
  aggregateQuery: { current: {} as Record<string, unknown> },
  threadQuery: { current: {} as Record<string, unknown> },
  listArgs: { current: [] as unknown[] },
  detailArgs: { current: [] as unknown[] },
  aggregateArgs: { current: [] as unknown[] },
  aggregateOptions: { current: {} as Record<string, unknown> },
  setLocation: vi.fn(),
  harnessOutput: { current: { events: [], eventsJobId: null, query: { isLoading: false, error: null } } as Record<string, unknown> },
  conversationMessagesQuery: { current: { data: [{ id: 1, role: "user", content: "Improve the SPEC-224 pilot UI" }], isLoading: false, error: null } as Record<string, unknown> },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { workerJobs: {
    observability: { useQuery: (...args: unknown[]) => { listArgs.current = args; return listQuery.current; } },
    observabilityDetail: { useQuery: (...args: unknown[]) => { detailArgs.current = args; return detailQuery.current; } },
    observabilityAggregate: { useQuery: (...args: unknown[]) => { aggregateArgs.current = args; aggregateOptions.current = args[1] as Record<string, unknown>; return aggregateQuery.current; } },
  }, runnerNodes: { list: { useQuery: () => runnerQuery.current } }, chat: {
    listRecentConversationThreads: { useInfiniteQuery: () => threadQuery.current },
    getMessages: { useQuery: () => conversationMessagesQuery.current },
  } },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    locale: "en",
    t: (key: string, params?: Record<string, string | number>) => ({
      "threads.overviewTitle": "Thread overview",
      "threads.overviewDescription": "Recent project threads",
      "threads.overviewHint": "Choose a thread to continue.",
      "threads.allStatuses": "All statuses",
      "threads.loading": "Loading threads…",
      "threads.overviewUnavailable": "Thread overview unavailable",
      "threads.retryOverview": "Retry thread overview",
      "threads.refreshing": "Refreshing…",
      "threads.overviewEmpty": "No work threads match this view yet.",
      "threads.projectUnlinked": "Unlinked project",
      "threads.projectThreads": `Threads for ${params?.project ?? "project"}`,
      "threads.openThread": `Open ${params?.thread ?? "thread"} in ${params?.conversation ?? "chat"}`,
      "threads.openTaskControl": "Open Task Control",
      "threads.loadingMore": "Loading more threads…",
      "threads.loadMore": "Load more threads",
      "threads.timeUnknown": "Time unknown",
      "threads.status.WORKING": "Working",
    }[key] ?? key),
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/agent-monitor", setLocation],
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", { ...props, href }, children),
}));

vi.mock("@/lib/useTaskHarnessOutputEvents", () => ({
  useTaskHarnessOutputEvents: () => harnessOutput.current,
}));

import TaskObservabilityMonitor from "./TaskObservabilityMonitor";

function renderMonitor(mode: "simple" | "developer" = "simple") {
  const result = render(<TaskObservabilityMonitor />);
  if (mode === "developer") fireEvent.click(screen.getByText("Developer"));
  return result;
}

const job = { id: "job-1", jobType: "spec224.development", status: "running", stage: "IMPLEMENT", attempt: 1, maxAttempts: 2, heartbeatAt: null, createdAt: "2026-10-17T00:00:00Z", workerId: null, runnerId: "runner-1", runnerSessionState: "running", conversationId: 451, conversationTitle: "Authorized pilot", threadId: "c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1", threadTitle: "SPEC-224 pilot", projectId: null, specId: null, identityBinding: { status: "UNKNOWN", source: null }, operatorAttention: { required: false, reason: null }, recovery: { nextRetryAt: null, retryEligible: false } };

beforeEach(() => {
  window.history.replaceState({}, "", "/agent-monitor");
  listQuery.current = { data: { scope: "owner", items: [job], snapshot: { asOf: "2026-10-17T00:00:00Z", expiresAt: "2026-10-17T00:10:00Z", projectionToken: "shared.snapshot-token" }, nextCursor: null }, isLoading: false, error: null, refetch: vi.fn() };
  listArgs.current = [];
  detailArgs.current = [];
  aggregateArgs.current = [];
  aggregateOptions.current = {};
  runnerQuery.current = { data: { runners: [{ runnerId: "runner-1", displayName: "Runner One", displayState: "ready", trustState: "trusted", status: "online", lastSeenAt: "2026-10-17T00:00:00Z", snapshotExpiresAt: "2026-10-17T00:10:00Z", workspaceCount: 0, toolCount: 2, capabilityCount: 3, capabilityInventory: [{ id: "harness.codex", label: "Codex CLI", status: "ready", availability: "available" }] }] }, isLoading: false, error: null };
  aggregateQuery.current = { data: null, isLoading: false, error: null };
  threadQuery.current = {
    data: { pages: [{ items: [{
      threadId: "recent-thread-1", parentThreadId: null, title: "Recent implementation", kind: "thread",
      lastActivityAt: "2026-10-29T12:00:00.000Z", createdAt: "2026-10-29T10:00:00.000Z", status: "WORKING",
      latestJob: { jobId: "recent-job-1", status: "running", statusReason: null, hasReviewableEvidence: false, createdAt: "2026-10-29T10:00:00.000Z", heartbeatAt: null },
      conversationId: 777, conversationTitle: "Platform work", projectId: "project-1", projectTitle: "SmartAIHub Core",
    }], nextCursor: null }] }, isLoading: false, error: null, hasNextPage: false, refetch: vi.fn(),
  };
  setLocation.mockClear();
  detailQuery.current = { data: {
    ...job,
    heartbeatFreshness: "unknown",
    runner: { status: "unknown", freshness: "unknown" },
    identityBinding: { status: "UNKNOWN", source: null },
    modelSelection: { uiSessionModel: "ui-model", source: "owned_conversation_current_config", asOf: "2026-10-17T00:01:00Z", rationale: { mode: "auto-provider", selectedModel: "requested-model", lastResolvedModel: "resolved-model", provider: "provider-a", updatedAt: "2026-10-17T00:00:00Z" } },
    operatorAttention: { required: true, reason: "human_review_required" },
    recovery: { retryEligible: false, nextRetryAt: null, runnerSessionState: "waiting" },
    goal: { status: "BASELINE_MISSING", reason: "trusted_baseline_missing", verifiedGoalCompletion: { percent: null, rawPercent: null }, executionProgress: { percent: null }, implementationCompletion: { percent: null }, workCompletion: { percent: null }, evidenceCoverage: { coveredCriteria: 0, totalCriteria: 0 }, remainingScope: [], blockedScope: [] },
    usage: { counts: { unique: 1, corrections: 1, replayed: 1, missing: 0, conflicts: 0, overlap: 0 }, completeTotalTokens: null, knownSubtotalTokens: 37055, coverageReason: null, coverage: { status: "PARTIAL", reason: "linked only" }, receipts: [{ identity: { scope: "job-1", consumptionId: "job-1:call-1" }, asOf: "2026-10-17T00:01:00Z", model: { uiSession: null, requested: "worker-model", effective: null, helper: null }, selection: { phase: "IMPLEMENT", role: "implementer", effort: "medium", policyProfile: "GENERAL", rationale: null, selectedAt: "2026-10-17T00:00:00Z" }, tokens: { inputTokens: 36933, cachedInputTokens: 18176, outputTokens: 122, totalTokens: 37055, reason: null }, sourceRefs: [{ kind: "canonical_correction_event", reference: "event-1" }] }], reservations: [], settlements: [] },
    quotaCoverage: { status: "UNKNOWN", reason: "No linked quota observation." },
    timeline: [{ id: "event-1", at: "2026-10-17T00:01:00Z", type: "CODEX_MODEL_USAGE_CORRECTED", attempt: 1, phase: null, reasonCode: null, correction: { modelCallId: "call-1", previousUsage: { inputTokens: 18447, cachedInputTokens: 18176, outputTokens: 122 }, correctedUsage: { inputTokens: 36933, cachedInputTokens: 18176, outputTokens: 122 }, additionalCharge: 18486 } }],
  }, isLoading: false, error: null };
  harnessOutput.current = { events: [], eventsJobId: null, query: { isLoading: false, error: null } };
  conversationMessagesQuery.current = { data: [{ id: 1, role: "user", content: "Improve the SPEC-224 pilot UI" }], isLoading: false, error: null };
});

describe("TaskObservabilityMonitor", () => {
  it("shows the global authorized Project/Thread overview and opens its exact Chat context", () => {
    renderMonitor();
    expect(screen.getByRole("region", { name: "Thread overview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Recent implementation in Platform work" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Task Control" })).toHaveAttribute("href", "/agent-monitor?conversationId=777&threadId=recent-thread-1&jobId=recent-job-1");
    fireEvent.click(screen.getByRole("button", { name: "Open Recent implementation in Platform work" }));
    expect(setLocation).toHaveBeenCalledWith("/chat?c=777&t=recent-thread-1");
  });

  it("defaults to a simple evidence summary and keeps unknown progress explicit", () => {
    renderMonitor();
    expect(screen.getByRole("heading", { name: "Mission Control" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Connected Runners & Harnesses" })).toBeTruthy();
    expect(screen.getByText("Codex CLI · harness.codex")).toBeTruthy();
    expect(screen.getByRole("button", { name: "SPEC-224 pilot · In progress" })).toBeTruthy();
    expect(screen.getByText("Chat: Authorized pilot")).toBeTruthy();
    expect(screen.getAllByText("Current step: implement").length).toBeGreaterThan(0);
    expect(screen.getByText(/Verified progress: Unknown · trusted_baseline_missing/)).toBeTruthy();
    expect(screen.getByText("Action needed: Please review this task.")).toBeTruthy();
    expect(screen.getByText("Improve the SPEC-224 pilot UI")).toBeTruthy();
    expect(screen.getByText(/Verified criteria remaining: Unknown until trusted goal progress/)).toBeTruthy();
    expect(screen.getByText("No final deliverable references are recorded in this task view.")).toBeTruthy();
    expect(screen.queryByText(/Current UI Session Model:/)).toBeNull();
  });

  it("shows durable harness output in Developer mode for the selected task", () => {
    harnessOutput.current = {
      events: [{ id: "output-1", sequence: 1, at: "2026-10-30T01:00:00.000Z", attempt: 1, kind: "PROGRESS", text: "Running focused tests", chunkIndex: 0, chunkCount: 1 }],
      eventsJobId: "job-1",
      query: { isLoading: false, error: null },
    };
    renderMonitor("developer");
    expect(screen.getByRole("heading", { name: "Live Harness Output" })).toBeTruthy();
    expect(screen.getByText("Running focused tests")).toBeTruthy();
  });

  it("provides obvious navigation between Chat, Task Control, and Mission Control", () => {
    renderMonitor();
    expect(screen.getByRole("navigation", { name: "Development workspace" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Task Control" }));
    expect(setLocation).toHaveBeenCalledWith("/chat?mode=tasks");
  });

  it("opens the originating Chat thread from the same task in both Task Control views", () => {
    renderMonitor();
    const href = "/chat?c=451&t=c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1";
    expect(screen.getByRole("link", { name: "Open in Chat thread" })).toHaveAttribute("href", href);
    fireEvent.click(screen.getByText("Developer"));
    expect(screen.getByRole("link", { name: "Open in Chat thread" })).toHaveAttribute("href", href);
  });

  it("shows authorized thread-to-Job correlation and preserves exact IDs in both navigation links", () => {
    renderMonitor("developer");
    expect(screen.getByRole("heading", { name: "Project and thread correlation" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open this thread in Chat" })).toHaveAttribute("href", "/chat?c=451&t=c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1");
    expect(screen.getByRole("link", { name: "Open exact task" })).toHaveAttribute("href", "/agent-monitor?jobId=job-1&conversationId=451&threadId=c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1");
  });

  it("loads an exact Job deep link with its authorization-bound conversation and thread scope", () => {
    window.history.replaceState({}, "", "/agent-monitor?conversationId=451&threadId=c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1&jobId=job-1");
    render(<TaskObservabilityMonitor />);
    expect(listArgs.current[0]).toMatchObject({ conversationId: 451, threadId: "c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1", jobId: "job-1" });
    expect(detailArgs.current[0]).toMatchObject({ jobId: "job-1" });
  });

  it("switches to developer evidence while retaining the same selected task", () => {
    renderMonitor();
    fireEvent.click(screen.getByText("Developer"));
    expect(screen.getByText(/Current UI Session Model: ui-model/)).toBeTruthy();
    expect(screen.getByText(/durable Runner events and refreshes/)).toBeTruthy();
    fireEvent.click(screen.getByText("Simple"));
    expect(screen.queryByText(/Current UI Session Model:/)).toBeNull();
    expect(screen.getAllByText("Current step: implement").length).toBeGreaterThan(0);
  });

  it("shows unknown goal evidence and separates all four model identity facets", () => {
    renderMonitor("developer");
    expect(screen.getByText(/no trusted goal baseline|trusted_baseline_missing/i)).toBeTruthy();
    expect(screen.getByText(/UI Session Unknown .* Worker requested worker-model .* Provider effective Unknown .* External helper Unknown/)).toBeTruthy();
    expect(screen.getByText(/Current UI Session Model: ui-model · source owned_conversation_current_config/)).toBeTruthy();
    expect(screen.getByText(/18,176/)).toBeTruthy();
  });

  it("shows evidence-backed human attention and canonical recovery timeline", () => {
    renderMonitor("developer");
    expect(screen.getByText(/Human attention: human_review_required/)).toBeTruthy();
    expect(screen.getByText(/CODEX_MODEL_USAGE_CORRECTED/)).toBeTruthy();
    expect(screen.getByText(/usage corrected 18447\/122 → 36933\/122/)).toBeTruthy();
  });

  it("shows runner fleet state from the canonical runner read model", () => {
    renderMonitor("developer");
    expect(screen.getByText(/Available runner fleet/)).toBeTruthy();
    expect(screen.getAllByText(/Runner One/)).toHaveLength(4);
    expect(screen.getAllByText(/snapshot expires 2026-10-17T00:10:00Z/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /↳ spec224\.development · running · job-1/ })).toBeTruthy();
  });

  it("applies explicit project and SPEC aggregation filters", () => {
    aggregateQuery.current = { data: {
      scope: "project_spec", projectId: "project-2", specId: "SPEC-277", scopeBinding: { status: "UNVERIFIED", reason: "metadata binding" }, observedJobCount: 2,
      asOf: "2026-10-17T00:00:00Z", consistency: "created_at_watermark_live_state", goalCoverage: { status: "UNKNOWN", baselineCandidateCount: 0, reason: "No trusted goal baselines." },
      usage: { counts: { unique: 3, corrections: 1, replayed: 0, missing: 1, overlap: 0 }, completeTotalTokens: null, knownSubtotalTokens: 37055, coverage: { reason: "capped/linked coverage", sources: ["worker_job_provider_reservations"], missingSources: ["unlinked helpers"] }, settlements: [] },
      resourceEstimates: { reservedTokenEstimate: 4000, observedReservationCount: 3, missingReservationTokenEstimateCount: 1, inferenceCostEstimateMicros: 0, missingInferenceCostEstimateCount: 0 },
      quotaCoverage: { status: "UNKNOWN" },
    }, isLoading: false, error: null };
    renderMonitor("developer");
    fireEvent.change(screen.getByLabelText("Project ID"), { target: { value: "project-2" } });
    fireEvent.change(screen.getByLabelText("SPEC ID"), { target: { value: "SPEC-277" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply scope" }));
    expect(screen.getByText(/Project ID/)).toBeTruthy();
    expect(screen.getByText(/Project \/ SPEC usage union/)).toBeTruthy();
    expect(screen.getByText(/Complete linked token total Unknown/)).toBeTruthy();
  });

  it("reuses the list projection token for Task Detail and Project/SPEC reads", () => {
    renderMonitor("developer");
    expect(detailArgs.current[0]).toMatchObject({ jobId: "job-1", projectionToken: "shared.snapshot-token" });
    fireEvent.change(screen.getByLabelText("Project ID"), { target: { value: "project-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply scope" }));
    expect(aggregateArgs.current[0]).toMatchObject({ projectId: "project-2", projectionToken: "shared.snapshot-token" });
  });

  it("waits for a projection token before reading Project/SPEC aggregate", () => {
    listQuery.current = { data: { scope: "owner", items: [job], snapshot: { asOf: "2026-10-17T00:00:00Z", expiresAt: "2026-10-17T00:10:00Z" }, nextCursor: null }, isLoading: false, error: null };
    renderMonitor("developer");
    fireEvent.change(screen.getByLabelText("Project ID"), { target: { value: "project-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply scope" }));
    expect(aggregateOptions.current.enabled).toBe(false);
  });

  it("labels an expired projection snapshot and offers a fresh read", () => {
    listQuery.current = { data: undefined, isLoading: false, error: { data: { code: "PRECONDITION_FAILED" } }, refetch: vi.fn() };
    renderMonitor("developer");
    expect(screen.getByText("Snapshot expired. Refresh snapshot to load current evidence.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh snapshot" })).toBeTruthy();
  });
});


it("withholds cached task detail after the authorized read fails", () => {
  detailQuery.current = { ...detailQuery.current, error: new Error("TASK_NOT_FOUND") };
  renderMonitor("developer");
  expect(screen.getByText("Task detail is unavailable in the current account scope.")).toBeTruthy();
  expect(screen.queryByText(/Current UI Session Model:/)).toBeNull();
  expect(screen.queryByText(/Observed receipt total:/)).toBeNull();
});
