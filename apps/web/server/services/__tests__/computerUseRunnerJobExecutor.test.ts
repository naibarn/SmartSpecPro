import { describe, expect, it, vi } from "vitest";

const { mockDispatch } = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
}));

const { mockRunnerControlPlaneOrigin } = vi.hoisted(() => ({
  mockRunnerControlPlaneOrigin: vi.fn(() => "https://smartaihub.app"),
}));

vi.mock("../runnerJobCommandClient", () => ({
  dispatchRunnerJobCommand: mockDispatch,
}));

vi.mock("../appRuntimeConfig", () => ({
  getCachedRunnerControlPlaneOrigin: mockRunnerControlPlaneOrigin,
}));

import { executeComputerUseBrowserJob } from "../computerUseRunnerJobExecutor";
import { buildSemanticActionCommand } from "../computerUseSemanticHandshake";

const approvalObservation = {
  observationId: "observation-approval",
  revision: 1,
  observedAt: "2026-09-21T00:00:00.000Z",
  surface: "browser" as const,
  origin: "https://smartaihub.app",
  url: "https://smartaihub.app/p213-fixture",
  browserGeneration: "browser-generation-approval",
  elements: [],
  observationHash: "observation:sha256:approval",
};
const approvalCandidate = {
  candidateId: "candidate-approval",
  operation: "CLICK" as const,
  targetRef: "target:continue",
  targetIdentity: "button:Continue",
  allowed: true as const,
  riskLevel: "LOW" as const,
  requiresApproval: false,
  semanticHint: "Click Continue",
  observationId: approvalObservation.observationId,
  observationRevision: approvalObservation.revision,
  browserGeneration: approvalObservation.browserGeneration,
  frameId: "main",
  origin: approvalObservation.origin,
  supportedActionFamilies: ["click" as const],
};
const approvalCandidateSet = {
  candidateSetId: "candidate-set:approval",
  candidateSetHash: "candidate-set-hash:approval",
  reductionStrategy: "spec208-deterministic-v1" as const,
  observationId: approvalObservation.observationId,
  observationRevision: approvalObservation.revision,
  browserGeneration: approvalObservation.browserGeneration,
  candidates: [approvalCandidate],
  exclusions: [],
  createdAt: "2026-09-21T00:00:00.000Z",
};
const approvalDecision = {
  status: "SELECTED" as const,
  decisionId: "decision:approval",
  selectedCandidateId: approvalCandidate.candidateId,
  observationId: approvalObservation.observationId,
  observationRevision: approvalObservation.revision,
  candidateSetId: approvalCandidateSet.candidateSetId,
  candidateSetHash: approvalCandidateSet.candidateSetHash,
};
const approvalPolicyDecision = {
  version: "2026-03-10",
  tenantId: "tenant-p213",
  userId: 109,
  workflowId: 0,
  executionId: "job-p213-approval",
  traceId: "trace-p213-approval",
  actionType: "click",
  actionClass: "read",
  pageSensitivity: "none",
  decision: "allow" as const,
  reasonCodes: [],
  confidence: 1,
  riskScore: 0,
  evidence: { actionDigest: "decision:sha256:approval" },
  approval: { required: false },
};

function approvalActionId(): string {
  const command = buildSemanticActionCommand({
    baseCommand: {
      commandId: "command-observe",
      commandType: "execute",
      contractVersion: "runner-job-v1",
      jobId: "job-p213-approval",
      attempt: 1,
      leaseId: "lease:job-p213-approval:attempt-1",
      fencingToken: 5,
      tenantId: "tenant-p213",
      userId: 109,
      runnerId: "runner-p213",
      runnerSessionId: "session-p213",
      capabilitySnapshotId: "snapshot-p213",
      capabilitySnapshotRevision: "revision-p213",
      controlPlaneOrigin: "https://smartaihub.app",
      executionKind: "computer_use.browser",
      adapterId: "browser.v1",
      adapterVersionConstraint: "0.1.0",
      browserEngineConstraint: "chromium",
      idempotencyKey: "computer-use:job-p213-approval:1",
      deadline: "2099-01-01T00:00:00.000Z",
      authorizationGrantRef: "runner-auth:sha256:grant",
      inputRef: "runner-input:job-p213-approval:attempt-1",
      payload: {
        stage: "observe",
        fixtureUrl: "https://smartaihub.app/p213-fixture",
        correlation: { traceId: "trace-p213-approval" },
        requiresIndependentVerification: true,
        verification: { required: true, verifier: "spec208-independent-v1", mode: "post_observation" },
      },
    } as any,
    observation: approvalObservation,
    candidateSet: approvalCandidateSet,
    decision: approvalDecision,
    policyDecision: approvalPolicyDecision as any,
    selectedCandidate: approvalCandidate,
  });
  return (command.payload as any).lineage.actionId;
}

describe("Feature 195 Computer Use Runner executor", () => {
  it("pins semantic verification metadata on the canonical external wait", async () => {
    mockDispatch.mockResolvedValueOnce({
      status: "accepted",
      commandId: "command-p213",
      runnerId: "runner-p213",
      runnerSessionId: "session-p213",
    });
    const waitForExternal = vi.fn();
    const result = await executeComputerUseBrowserJob({
      context: {
        jobId: "job-p213",
        attempt: 1,
        tenantId: "tenant-p213",
        requestedByUserId: 109,
        timeoutSeconds: 60,
        input: {
          traceId: "trace-p213",
          computerUseRunId: "run-p213",
          runnerId: "runner-p213",
          runnerSessionId: "session-p213",
          capabilitySnapshotId: "snapshot-p213",
          capabilitySnapshotRevision: "revision-p213",
          authorizationGrantRef: "runner-auth:sha256:grant",
          payload: {
            operation: "observe",
            action: "none",
            requiresIndependentVerification: true,
            decisionRequest: { requestedProvider: "rules", goal: "observe page" },
            verification: { required: true, verifier: "spec208-independent-v1" },
          },
        },
      } as any,
      lease: {
        jobId: "job-p213",
        attemptId: "attempt-p213",
        leaseToken: "lease-token",
        fencingVersion: 4,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      reporter: { waitForExternal, assertActive: vi.fn() },
      controlPlane: { failExternalWait: vi.fn() },
    });

    expect(result).toMatchObject({ deferred: true });
    expect(waitForExternal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metadata: expect.objectContaining({
        requiresIndependentVerification: true,
        decisionRequest: { requestedProvider: "rules", goal: "observe page" },
        verification: { required: true, verifier: "spec208-independent-v1" },
      }),
    }));
    const commandPayload = mockDispatch.mock.calls[0][0].payload;
    expect(mockDispatch.mock.calls[0][0]).toMatchObject({
      controlPlaneOrigin: "https://smartaihub.app",
    });
    expect(commandPayload).toMatchObject({
      stage: "observe",
      observationRequest: expect.objectContaining({ goal: "observe page" }),
    });
    expect(commandPayload).not.toHaveProperty("action");
    expect(commandPayload).not.toHaveProperty("targetId");
    expect(commandPayload).not.toHaveProperty("selector");
  });

  it("resumes an approved continuation as the selected action on a fresh lease", async () => {
    mockDispatch.mockClear();
    mockDispatch.mockResolvedValueOnce({
      status: "accepted",
      commandId: "command-approved-action",
      runnerId: "runner-p213",
      runnerSessionId: "session-p213",
    });
    const waitForExternal = vi.fn();
    const actionId = approvalActionId();
    const result = await executeComputerUseBrowserJob({
      context: {
        jobId: "job-p213-approval",
        attempt: 1,
        tenantId: "tenant-p213",
        requestedByUserId: 109,
        timeoutSeconds: 60,
        input: {
          traceId: "trace-p213-approval",
          computerUseRunId: "run-p213-approval",
          runnerId: "runner-p213",
          runnerSessionId: "session-p213",
          capabilitySnapshotId: "snapshot-p213",
          capabilitySnapshotRevision: "revision-p213",
          authorizationGrantRef: "runner-auth:sha256:grant",
          payload: {
            operation: "observe",
            action: "none",
            requiresIndependentVerification: true,
            fixtureUrl: "https://smartaihub.app/p213-fixture",
            decisionRequest: { requestedProvider: "rules", goal: "click Continue", allowedActionFamilies: ["click"], maxCandidates: 8 },
            approvalContinuation: {
              approvalRequestId: "approval-p213",
              actionId,
              runnerId: "runner-p213",
              runnerSessionId: "session-p213",
              capabilitySnapshotId: "snapshot-p213",
              capabilitySnapshotRevision: "revision-p213",
              fencingVersion: 4,
              semanticState: {
                preObservation: approvalObservation,
                candidateSet: approvalCandidateSet,
                decision: approvalDecision,
                policyDecision: approvalPolicyDecision,
                selectedCandidate: approvalCandidate,
                actionId,
              },
          },
        },
      },
      },
      lease: {
        jobId: "job-p213-approval",
        attemptId: "attempt-p213-approval",
        leaseToken: "lease-token-approved",
        fencingVersion: 5,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      reporter: { waitForExternal, assertActive: vi.fn() },
      controlPlane: { failExternalWait: vi.fn() },
    });

    expect(result).toMatchObject({ deferred: true });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0].payload).toMatchObject({
      stage: "action",
      lineage: { actionId, selectedCandidateId: approvalCandidate.candidateId },
    });
    expect(mockDispatch.mock.calls[0][0].payload).not.toHaveProperty("observationRequest");
    expect(mockDispatch.mock.calls[0][0].fencingToken).toBe(5);
    expect(waitForExternal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metadata: expect.objectContaining({
        approvalContinuation: expect.objectContaining({ approvalRequestId: "approval-p213" }),
        commandStage: "action",
      }),
    }));
  });
});
