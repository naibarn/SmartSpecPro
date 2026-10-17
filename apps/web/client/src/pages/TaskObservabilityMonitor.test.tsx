/** @vitest-environment jsdom */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { listQuery, detailQuery, runnerQuery } = vi.hoisted(() => ({
  listQuery: { current: {} as Record<string, unknown> },
  detailQuery: { current: {} as Record<string, unknown> },
  runnerQuery: { current: {} as Record<string, unknown> },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { workerJobs: {
    observability: { useQuery: () => listQuery.current },
    observabilityDetail: { useQuery: () => detailQuery.current },
  }, runnerNodes: { list: { useQuery: () => runnerQuery.current } } },
}));

import TaskObservabilityMonitor from "./TaskObservabilityMonitor";

const job = { id: "job-1", jobType: "spec224.development", status: "running", stage: "IMPLEMENT", attempt: 1, maxAttempts: 2, heartbeatAt: null, createdAt: "2026-10-17T00:00:00Z", workerId: null, projectId: null, specId: null, identityBinding: { status: "UNKNOWN", source: null }, operatorAttention: { required: false, reason: null }, recovery: { nextRetryAt: null, retryEligible: false } };

beforeEach(() => {
  listQuery.current = { data: { scope: "owner", items: [job], snapshot: { asOf: "2026-10-17T00:00:00Z", expiresAt: "2026-10-17T00:10:00Z" }, nextCursor: null }, isLoading: false, error: null, refetch: vi.fn() };
  runnerQuery.current = { data: { runners: [{ runnerId: "runner-1", displayName: "Runner One", displayState: "ready", trustState: "trusted", status: "online", lastSeenAt: "2026-10-17T00:00:00Z", snapshotExpiresAt: "2026-10-17T00:10:00Z", workspaceIds: [], toolCount: 2, capabilityCount: 3 }] }, isLoading: false, error: null };
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
    timeline: [{ id: "event-1", at: "2026-10-17T00:01:00Z", type: "CODEX_MODEL_USAGE_CORRECTED", attempt: 1, phase: null, reasonCode: null }],
  }, isLoading: false, error: null };
});

describe("TaskObservabilityMonitor", () => {
  it("shows unknown goal evidence and separates all four model identity facets", () => {
    render(<TaskObservabilityMonitor />);
    expect(screen.getByText(/no trusted goal baseline|trusted_baseline_missing/i)).toBeTruthy();
    expect(screen.getByText(/UI Session Unknown .* Worker requested worker-model .* Provider effective Unknown .* External helper Unknown/)).toBeTruthy();
    expect(screen.getByText(/Current UI Session Model: ui-model · source owned_conversation_current_config/)).toBeTruthy();
    expect(screen.getByText(/18,176/)).toBeTruthy();
  });

  it("shows evidence-backed human attention and canonical recovery timeline", () => {
    render(<TaskObservabilityMonitor />);
    expect(screen.getByText(/Human attention: human_review_required/)).toBeTruthy();
    expect(screen.getByText(/CODEX_MODEL_USAGE_CORRECTED/)).toBeTruthy();
  });

  it("shows runner fleet state from the canonical runner read model", () => {
    render(<TaskObservabilityMonitor />);
    expect(screen.getByText(/Available runner fleet/)).toBeTruthy();
    expect(screen.getByText(/Runner One/)).toBeTruthy();
    expect(screen.getByText(/snapshot expires 2026-10-17T00:10:00Z/)).toBeTruthy();
  });

  it("applies explicit project and SPEC aggregation filters", () => {
    render(<TaskObservabilityMonitor />);
    fireEvent.change(screen.getByLabelText("Project ID"), { target: { value: "project-2" } });
    fireEvent.change(screen.getByLabelText("SPEC ID"), { target: { value: "SPEC-277" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply scope" }));
    expect(screen.getByText(/Project ID/)).toBeTruthy();
  });
});
