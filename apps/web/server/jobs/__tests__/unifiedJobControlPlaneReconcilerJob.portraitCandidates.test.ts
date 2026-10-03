import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunJobReconciler,
  mockReconcilePortraitCandidates,
  mockApprovalDecisionReconciliation,
  mockCreateApprovalDecisionReconciler,
} = vi.hoisted(() => ({
  mockRunJobReconciler: vi.fn(),
  mockReconcilePortraitCandidates: vi.fn(),
  mockApprovalDecisionReconciliation: vi.fn(),
  mockCreateApprovalDecisionReconciler: vi.fn(),
}));

vi.mock("../../services/jobReconciler", () => ({
  runJobReconciler: mockRunJobReconciler,
}));
vi.mock("../../services/feature186RuntimeAdapter", () => ({
  createFeature186RuntimeAdapter: vi.fn(() => ({ id: "node-adapter" })),
}));
vi.mock("../feature186JobTypes", () => ({
  isPostgresNodeJobType: vi.fn(() => true),
}));
vi.mock("../../services/postgresProviderSchedulerRepository", () => ({
  createPostgresProviderSchedulerRepository: vi.fn(),
}));
vi.mock("../../services/providerPollerService", () => ({
  runProviderPollerOnce: vi.fn(),
}));
vi.mock("../../services/pythonProviderPollClient", () => ({
  createPythonProviderPollClient: vi.fn(),
}));
vi.mock("../../services/cloudflareRuntimeTarget", () => ({
  assertGoogleRuntimeDisabled: vi.fn(),
  isFeature186HardCutoverEnabled: vi.fn(() => false),
}));
vi.mock("../../services/verticalDramaPortraitCandidateSettlement", () => ({
  reconcileStalePortraitCandidates: mockReconcilePortraitCandidates,
}));
vi.mock("../../services/spec224ApprovalContinuation", () => ({
  createSpec224ApprovalDecisionReconciler: mockCreateApprovalDecisionReconciler,
  createSpec224ExternalApprovalAuthority: vi.fn(() => ({ id: "approval-authority" })),
}));
vi.mock("../../services/jobControlPlane", () => ({
  createJobControlPlane: vi.fn(() => ({ id: "control-plane" })),
}));

import { runUnifiedJobControlPlaneReconcilerOnce } from "../unifiedJobControlPlaneReconcilerJob";

describe("unified control-plane reconciler portrait recovery hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunJobReconciler.mockResolvedValue({
      expiredRecovered: 0,
      retriesMadeDue: 0,
      deadlinesExpired: 0,
      softTimeoutsRequested: 0,
      outboxResults: 0,
      waitingCancelled: 0,
      waitingResumed: 0,
      waitingFailedForReview: 0,
      reconciliationErrors: 0,
      waitingDecisionsScanned: 0,
      waitingHeld: 0,
      waitingPending: 0,
      decisions: [],
    });
    mockReconcilePortraitCandidates.mockResolvedValue({
      scanned: 1,
      settled: 1,
      errors: 0,
    });
    mockApprovalDecisionReconciliation.mockResolvedValue({ claimed: 0, resumed: 0 });
    mockCreateApprovalDecisionReconciler.mockReturnValue(mockApprovalDecisionReconciliation);
  });

  it("runs bounded stale portrait recovery on each canonical reconciler pass", async () => {
    const now = new Date("2026-09-30T08:00:00.000Z");
    const result = await runUnifiedJobControlPlaneReconcilerOnce(now);
    expect(mockReconcilePortraitCandidates).toHaveBeenCalledWith(now);
    expect(mockApprovalDecisionReconciliation).toHaveBeenCalledOnce();
    expect(result.approvalDecisionReconciliation).toEqual({ claimed: 0, resumed: 0 });
  });

  it("keeps the control-plane pass healthy when portrait recovery fails", async () => {
    mockReconcilePortraitCandidates.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    await expect(runUnifiedJobControlPlaneReconcilerOnce()).resolves.toMatchObject({
      reconciliationErrors: 0,
    });
  });
});
