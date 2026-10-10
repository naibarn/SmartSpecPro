import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatchPendingAutoTeamEvaluations } = vi.hoisted(() => ({
  dispatchPendingAutoTeamEvaluations: vi.fn(),
}));

vi.mock("../autoTeamRecoveryService", () => ({
  dispatchPendingAutoTeamEvaluations,
}));

import { executeAutoTeamRecoveryScan } from "../autoTeamRecoveryScanExecutor";

function makeInput(assertActive = vi.fn().mockResolvedValue(undefined)) {
  return {
    context: { tenantId: "system-tenant", jobId: "scan-job" } as any,
    lease: { jobId: "scan-job", attemptId: "attempt-1" } as any,
    reporter: {
      assertActive,
      progress: vi.fn().mockResolvedValue(undefined),
    } as any,
  };
}

describe("AutoTeam recovery scan executor", () => {
  beforeEach(() => dispatchPendingAutoTeamEvaluations.mockReset());

  it("dispatches evaluations through the existing control plane and reports a bounded summary", async () => {
    dispatchPendingAutoTeamEvaluations.mockResolvedValue(2);
    const input = makeInput();

    await expect(executeAutoTeamRecoveryScan(input)).resolves.toEqual({
      output: { evaluationsQueued: 2 },
    });
    expect(dispatchPendingAutoTeamEvaluations).toHaveBeenCalledOnce();
    expect(input.reporter.assertActive).toHaveBeenCalledTimes(2);
    expect(input.reporter.progress).toHaveBeenLastCalledWith(
      input.lease,
      expect.objectContaining({
        stage: "scanned",
        measured: { evaluationsQueued: 2 },
      }),
    );
  });

  it("does not scan after the canonical lease is stale", async () => {
    const leaseError = new Error("lease reclaimed");
    const input = makeInput(vi.fn().mockRejectedValue(leaseError));

    await expect(executeAutoTeamRecoveryScan(input)).rejects.toBe(leaseError);
    expect(dispatchPendingAutoTeamEvaluations).not.toHaveBeenCalled();
  });


});
