import { describe, expect, it, vi } from "vitest";

import {
  createSpec224ApprovalContinuation,
  type Spec224ExternalApprovalCorrelation,
} from "../spec224ApprovalContinuation";

const correlation: Spec224ExternalApprovalCorrelation = {
  jobId: "job-224",
  tenantId: "tenant-224",
  operationKey: "external-agent:task-224:plan-1:1",
  provider: "codex",
  providerRequestId: "provider-request-1",
  runnerId: "runner-224",
  runnerSessionId: "session-224",
  capabilitySnapshotId: "snapshot-224",
  capabilitySnapshotRevision: "revision-1",
  fencingVersion: 4,
  actionId: "tool-call-1",
  requesterId: 109,
  semanticState: { tool: "workspace.edit", scope: "bounded" },
};

function makeDeps() {
  return {
    authority: {
      create: vi.fn().mockResolvedValue({
        id: "approval-224",
        status: "pending",
        tenantId: correlation.tenantId,
        executionId: correlation.jobId,
        payload: {},
      }),
      get: vi.fn(),
    },
    controlPlane: {
      requestComputerUseApproval: vi.fn().mockResolvedValue("requested"),
      resolveComputerUseApproval: vi.fn().mockResolvedValue("resumed"),
      failExternalWait: vi.fn().mockResolvedValue(true),
    },
  };
}

describe("Spec 224 external-agent approval continuation", () => {
  it("creates an authority-owned approval and projects it onto the canonical waiting job", async () => {
    const deps = makeDeps();
    const service = createSpec224ApprovalContinuation(deps);

    await expect(service.request(correlation)).resolves.toEqual({
      approvalRef: "approval-224",
      status: "pending",
    });
    expect(deps.authority.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: correlation.tenantId,
        executionId: correlation.jobId,
        payload: expect.objectContaining({
          kind: "spec224_external_agent_approval",
          spec224ExternalAgentResume: expect.objectContaining({
            jobId: correlation.jobId,
            runnerSessionId: correlation.runnerSessionId,
            fencingVersion: correlation.fencingVersion,
          }),
        }),
      }),
    );
    expect(deps.controlPlane.requestComputerUseApproval).toHaveBeenCalledWith(
      correlation.jobId,
      expect.objectContaining({
        tenantId: correlation.tenantId,
        approvalRequestId: "approval-224",
        currentCommandId: correlation.providerRequestId,
        runnerSessionId: correlation.runnerSessionId,
        capabilitySnapshotRevision: correlation.capabilitySnapshotRevision,
      }),
    );
  });

  it("resumes only an authority response correlated to the exact tenant, job and fence", async () => {
    const deps = makeDeps();
    deps.authority.get.mockResolvedValue({
      id: "approval-224",
      status: "approved",
      tenantId: correlation.tenantId,
      executionId: correlation.jobId,
      requesterId: correlation.requesterId,
      approverId: 207,
      payload: {
        kind: "spec224_external_agent_approval",
        spec224ExternalAgentResume: correlation,
      },
    });
    const service = createSpec224ApprovalContinuation(deps);

    await expect(
      service.resolve({ approvalRef: "approval-224", tenantId: correlation.tenantId }),
    ).resolves.toBe("resumed");
    expect(deps.controlPlane.resolveComputerUseApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: correlation.jobId,
        tenantId: correlation.tenantId,
        approvalRequestId: "approval-224",
        decision: "approved",
        runnerId: correlation.runnerId,
        runnerSessionId: correlation.runnerSessionId,
        fencingVersion: correlation.fencingVersion,
        approverId: 207,
      }),
    );
  });

  it("does not resume forged or cross-tenant approval records", async () => {
    const deps = makeDeps();
    deps.authority.get.mockResolvedValue({
      id: "approval-224",
      status: "approved",
      tenantId: "other-tenant",
      executionId: correlation.jobId,
      approverId: 207,
      payload: {
        kind: "spec224_external_agent_approval",
        spec224ExternalAgentResume: correlation,
      },
    });
    const service = createSpec224ApprovalContinuation(deps);

    await expect(
      service.resolve({ approvalRef: "approval-224", tenantId: correlation.tenantId }),
    ).resolves.toBe("ignored");
    expect(deps.controlPlane.resolveComputerUseApproval).not.toHaveBeenCalled();
  });

  it("routes expired or cancelled authority outcomes to operator review", async () => {
    const deps = makeDeps();
    deps.authority.get.mockResolvedValue({
      id: "approval-224",
      status: "expired",
      tenantId: correlation.tenantId,
      executionId: correlation.jobId,
      payload: {
        kind: "spec224_external_agent_approval",
        spec224ExternalAgentResume: correlation,
      },
    });
    const service = createSpec224ApprovalContinuation(deps, {
      now: () => new Date("2026-09-23T10:00:00.000Z"),
    });

    await expect(
      service.resolve({ approvalRef: "approval-224", tenantId: correlation.tenantId }),
    ).resolves.toBe("operator_review");
    expect(deps.controlPlane.failExternalWait).toHaveBeenCalledWith(
      correlation.jobId,
      "SPEC224_APPROVAL_EXPIRED",
      true,
      expect.any(Date),
      correlation.operationKey,
    );
  });

  it("rejects secret-bearing provider approval payloads", async () => {
    const deps = makeDeps();
    const service = createSpec224ApprovalContinuation(deps);

    await expect(
      service.request({
        ...correlation,
        semanticState: { accessToken: "must-not-cross-boundary" },
      }),
    ).rejects.toThrow("SPEC224_APPROVAL_SECRET_FIELD");
    expect(deps.authority.create).not.toHaveBeenCalled();
  });
});
